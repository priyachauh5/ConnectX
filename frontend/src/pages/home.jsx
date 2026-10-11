import React, { useContext, useState, useEffect } from 'react';
import withAuth from '../utils/withAuth';
import { useNavigate } from 'react-router-dom';
import "../App.css";
import {
    Box,
    Button,
    IconButton,
    TextField,
    Typography,
    Card,
    CardContent,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Snackbar,
    Alert,
    Tooltip,
    InputAdornment,
    Paper,
    CircularProgress
} from '@mui/material';
import RestoreIcon from '@mui/icons-material/Restore';
import LogoutIcon from '@mui/icons-material/Logout';
import VideoCallIcon from '@mui/icons-material/VideoCall';
import VideocamIcon from '@mui/icons-material/Videocam';
import KeyboardIcon from '@mui/icons-material/Keyboard';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ShareIcon from '@mui/icons-material/Share';
import CloseIcon from '@mui/icons-material/Close';
import axios from 'axios';
import server from '../environment';
import { AuthContext } from '../contexts/AuthContext';

function HomeComponent() {
    const navigate = useNavigate();
    const { addToUserHistory, handleLogout } = useContext(AuthContext);

    const [joinMeetingCode, setJoinMeetingCode] = useState("");
    const [joinError, setJoinError] = useState("");
    const [isJoining, setIsJoining] = useState(false);

    // New Meeting Dialog State
    const [newMeetingDialogOpen, setNewMeetingDialogOpen] = useState(false);
    const [createdMeetingCode, setCreatedMeetingCode] = useState("");
    const [isCreating, setIsCreating] = useState(false);

    // Notification Snackbar
    const [snackbar, setSnackbar] = useState({ open: false, message: "", severity: "success" });

    // Live Date/Time
    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const formattedTime = currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const formattedDate = currentTime.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });

    // Generate unique meeting code (e.g. abc-defg-hij)
    const generateUniqueMeetingCode = () => {
        const chars = "abcdefghijklmnopqrstuvwxyz";
        const getSegment = (length) => {
            let res = "";
            for (let i = 0; i < length; i++) {
                res += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            return res;
        };
        return `${getSegment(3)}-${getSegment(4)}-${getSegment(3)}`;
    };

    // Handler for "New Meeting"
    const handleOpenNewMeeting = () => {
        const code = generateUniqueMeetingCode();
        setCreatedMeetingCode(code);
        setNewMeetingDialogOpen(true);
    };

    // Handler to start created meeting
    const handleStartCreatedMeeting = async () => {
        if (!createdMeetingCode) return;
        setIsCreating(true);
        try {
            await addToUserHistory(createdMeetingCode);
            navigate(`/${createdMeetingCode}`);
        } catch (err) {
            console.error("Error starting meeting:", err);
            navigate(`/${createdMeetingCode}`);
        } finally {
            setIsCreating(false);
        }
    };

    // Copy meeting code
    const handleCopyCode = async (codeToCopy) => {
        try {
            await navigator.clipboard.writeText(codeToCopy);
            setSnackbar({ open: true, message: "Meeting code copied to clipboard!", severity: "success" });
        } catch (err) {
            setSnackbar({ open: true, message: `Code: ${codeToCopy}`, severity: "info" });
        }
    };

    // Share meeting link or copy invite
    const handleShareMeeting = async (codeToShare) => {
        const meetingUrl = `${window.location.origin}/${codeToShare}`;
        const shareData = {
            title: "ConnectX",
            text: `Join my meeting on ConnectX:\nMeeting Code: ${codeToShare}\nLink: ${meetingUrl}`,
            url: meetingUrl
        };

        if (navigator.share) {
            try {
                await navigator.share(shareData);
                return;
            } catch (err) {
                // User cancelled or unsupported, fallback to clipboard
            }
        }

        try {
            await navigator.clipboard.writeText(shareData.text);
            setSnackbar({ open: true, message: "Meeting invite copied to clipboard!", severity: "success" });
        } catch (err) {
            setSnackbar({ open: true, message: `Invite link: ${meetingUrl}`, severity: "info" });
        }
    };

    // Handler for "Join Meeting"
    const handleJoinVideoCall = async () => {
        let code = joinMeetingCode.trim();
        if (!code) {
            setJoinError("Please enter a meeting code");
            return;
        }

        // If user pasted a full URL (e.g. http://localhost:3000/abc-defg-hij), extract the code
        if (code.includes("/")) {
            const parts = code.split("/").filter(Boolean);
            code = parts[parts.length - 1];
        }

        setJoinError("");
        setIsJoining(true);

        try {
            const baseUrl = server.replace(/\/+$/, '');
            const valRes = await axios.get(`${baseUrl}/api/v1/users/validate_meeting/${encodeURIComponent(code)}`);

            if (valRes.data && valRes.data.exists) {
                const canonicalCode = valRes.data.meetingCode || code;
                try {
                    await addToUserHistory(canonicalCode);
                } catch (historyErr) {
                    console.warn("Could not save to history:", historyErr);
                }
                navigate(`/${canonicalCode}`);
            } else {
                setJoinError("Meeting not found. Please verify your meeting code.");
            }
        } catch (err) {
            console.error("Error joining video call:", err);
            if (err.response && err.response.status === 404) {
                setJoinError("Meeting not found. Please check your meeting code.");
            } else if (err.response && err.response.data && err.response.data.message) {
                setJoinError(err.response.data.message);
            } else {
                setJoinError("Unable to validate meeting code. Please try again.");
            }
        } finally {
            setIsJoining(false);
        }
    };

    return (
        <Box sx={{ minHeight: "100vh", bgcolor: "#f8f9fa", display: "flex", flexDirection: "column" }}>
            {/* Top Navigation Bar */}
            <Box
                sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    px: { xs: 2, md: 4 },
                    py: 1.5,
                    bgcolor: "#ffffff",
                    borderBottom: "1px solid #e0e0e0",
                    flexWrap: "wrap",
                    gap: 1
                }}
            >
                {/* Brand */}
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                    <VideocamIcon sx={{ color: "#1976d2", fontSize: 32 }} />
                    <Typography variant="h6" sx={{ fontWeight: 600, color: "#1a1a1a" }}>
                        ConnectX
                    </Typography>
                </Box>

                {/* Right controls */}
                <Box sx={{ display: "flex", alignItems: "center", gap: { xs: 1, sm: 2 } }}>
                    <Typography
                        variant="body2"
                        sx={{
                            color: "#5f6368",
                            display: { xs: "none", md: "block" },
                            fontWeight: 500
                        }}
                    >
                        {formattedTime} • {formattedDate}
                    </Typography>

                    <Tooltip title="View Meeting History">
                        <Button
                            variant="outlined"
                            startIcon={<RestoreIcon />}
                            onClick={() => navigate("/history")}
                            size="small"
                            sx={{ textTransform: "none", borderRadius: 2 }}
                        >
                            History
                        </Button>
                    </Tooltip>

                    <Tooltip title="Logout">
                        <Button
                            variant="outlined"
                            color="error"
                            startIcon={<LogoutIcon />}
                            onClick={handleLogout}
                            size="small"
                            sx={{ textTransform: "none", borderRadius: 2 }}
                        >
                            Logout
                        </Button>
                    </Tooltip>
                </Box>
            </Box>

            {/* Main Content Area */}
            <Box
                sx={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    px: { xs: 2, md: 6 },
                    py: { xs: 4, md: 6 }
                }}
            >
                <Box
                    sx={{
                        width: "100%",
                        maxWidth: 1200,
                        display: "flex",
                        flexDirection: { xs: "column", lg: "row" },
                        alignItems: "center",
                        gap: { xs: 5, lg: 8 }
                    }}
                >
                    {/* Left Panel: Hero & Meeting Actions */}
                    <Box sx={{ flex: 1, width: "100%" }}>
                        <Typography
                            variant="h3"
                            sx={{
                                fontWeight: 700,
                                color: "#202124",
                                lineHeight: 1.2,
                                mb: 2,
                                fontSize: { xs: "2rem", md: "2.8rem" }
                            }}
                        >
                            Premium video meetings.
                            <br />
                            <span style={{ color: "#1976d2" }}>Now free for everyone.</span>
                        </Typography>

                        <Typography
                            variant="body1"
                            sx={{ color: "#5f6368", fontSize: "1.1rem", mb: 4, maxWidth: 540 }}
                        >
                            Connect, collaborate, and celebrate from anywhere with secure, high-quality video calls.
                        </Typography>

                        {/* Meeting Action Cards */}
                        <Box sx={{ display: "flex", flexDirection: { xs: "column", sm: "row" }, gap: 2.5, mb: 4 }}>
                            {/* OPTION 1: New Meeting Card */}
                            <Card
                                elevation={2}
                                sx={{
                                    flex: 1,
                                    borderRadius: 3,
                                    border: "1px solid #e3e8ee",
                                    transition: "transform 0.2s, box-shadow 0.2s",
                                    "&:hover": { transform: "translateY(-3px)", boxShadow: 4 }
                                }}
                            >
                                <CardContent sx={{ p: 3, display: "flex", flexDirection: "column", height: "100%" }}>
                                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1.5 }}>
                                        <Box
                                            sx={{
                                                bgcolor: "#e3f2fd",
                                                color: "#1976d2",
                                                p: 1.2,
                                                borderRadius: 2,
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center"
                                            }}
                                        >
                                            <VideoCallIcon fontSize="large" />
                                        </Box>
                                        <Typography variant="h6" sx={{ fontWeight: 600 }}>
                                            New Meeting
                                        </Typography>
                                    </Box>

                                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5, flex: 1 }}>
                                        Get a unique link you can share with people you want to meet with.
                                    </Typography>

                                    <Button
                                        variant="contained"
                                        size="large"
                                        startIcon={<VideoCallIcon />}
                                        onClick={handleOpenNewMeeting}
                                        fullWidth
                                        sx={{
                                            py: 1.2,
                                            borderRadius: 2,
                                            textTransform: "none",
                                            fontWeight: 600,
                                            bgcolor: "#1976d2",
                                            "&:hover": { bgcolor: "#1565c0" }
                                        }}
                                    >
                                        Create Meeting
                                    </Button>
                                </CardContent>
                            </Card>

                            {/* OPTION 2: Join Meeting Card */}
                            <Card
                                elevation={2}
                                sx={{
                                    flex: 1,
                                    borderRadius: 3,
                                    border: "1px solid #e3e8ee",
                                    transition: "transform 0.2s, box-shadow 0.2s",
                                    "&:hover": { transform: "translateY(-3px)", boxShadow: 4 }
                                }}
                            >
                                <CardContent sx={{ p: 3, display: "flex", flexDirection: "column", height: "100%" }}>
                                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1.5 }}>
                                        <Box
                                            sx={{
                                                bgcolor: "#fff3e0",
                                                color: "#f57c00",
                                                p: 1.2,
                                                borderRadius: 2,
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center"
                                            }}
                                        >
                                            <KeyboardIcon fontSize="large" />
                                        </Box>
                                        <Typography variant="h6" sx={{ fontWeight: 600 }}>
                                            Join a Meeting
                                        </Typography>
                                    </Box>

                                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                                        Enter the meeting code shared with you.
                                    </Typography>

                                    <TextField
                                        placeholder="abc-defg-hij"
                                        value={joinMeetingCode}
                                        onChange={(e) => {
                                            setJoinMeetingCode(e.target.value);
                                            if (joinError) setJoinError("");
                                        }}
                                        error={!!joinError}
                                        helperText={joinError}
                                        size="small"
                                        fullWidth
                                        sx={{ mb: 1.5 }}
                                        InputProps={{
                                            startAdornment: (
                                                <InputAdornment position="start">
                                                    <KeyboardIcon sx={{ color: "#9e9e9e" }} />
                                                </InputAdornment>
                                            )
                                        }}
                                    />

                                    <Button
                                        variant="outlined"
                                        size="large"
                                        onClick={handleJoinVideoCall}
                                        disabled={isJoining}
                                        fullWidth
                                        sx={{
                                            py: 1.2,
                                            borderRadius: 2,
                                            textTransform: "none",
                                            fontWeight: 600
                                        }}
                                    >
                                        {isJoining ? <CircularProgress size={24} /> : "Join Meeting"}
                                    </Button>
                                </CardContent>
                            </Card>
                        </Box>
                    </Box>

                    {/* Right Panel: Clean Preview/Illustration */}
                    <Box
                        sx={{
                            flex: 0.9,
                            width: "100%",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center"
                        }}
                    >
                        <Paper
                            elevation={0}
                            sx={{
                                p: 3,
                                textAlign: "center",
                                bgcolor: "transparent",
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center"
                            }}
                        >
                            <Box
                                component="img"
                                src="/logo3.png"
                                alt="Video Meeting Illustration"
                                sx={{
                                    maxWidth: { xs: "80%", md: "380px" },
                                    height: "auto",
                                    borderRadius: 4,
                                    mb: 2,
                                    boxShadow: "0 8px 24px rgba(0,0,0,0.06)"
                                }}
                            />
                            <Typography variant="h6" sx={{ fontWeight: 600, color: "#202124", mb: 0.5 }}>
                                Get a link you can share
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 320 }}>
                                Click <b>New Meeting</b> to generate a link you can send to people you want to meet with.
                            </Typography>
                        </Paper>
                    </Box>
                </Box>
            </Box>

            {/* Create New Meeting Modal/Dialog */}
            <Dialog
                open={newMeetingDialogOpen}
                onClose={() => setNewMeetingDialogOpen(false)}
                maxWidth="xs"
                fullWidth
                PaperProps={{
                    sx: { borderRadius: 3, p: 1 }
                }}
            >
                <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", pb: 1 }}>
                    <Typography variant="h6" sx={{ fontWeight: 700, color: "#202124" }}>
                        Create New Meeting
                    </Typography>
                    <IconButton size="small" onClick={() => setNewMeetingDialogOpen(false)}>
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>

                <DialogContent>
                    <Typography variant="body2" sx={{ color: "#5f6368", mb: 2.5 }}>
                        Your meeting is ready!
                    </Typography>

                    <Typography variant="caption" sx={{ fontWeight: 600, color: "#5f6368", textTransform: "uppercase" }}>
                        Meeting Code:
                    </Typography>

                    <Box
                        sx={{
                            mt: 0.8,
                            p: 2,
                            bgcolor: "#f1f3f4",
                            borderRadius: 2,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            border: "1px solid #e0e0e0"
                        }}
                    >
                        <Typography
                            variant="h5"
                            sx={{
                                fontFamily: "monospace",
                                fontWeight: 700,
                                letterSpacing: 1.5,
                                color: "#1976d2"
                            }}
                        >
                            {createdMeetingCode}
                        </Typography>

                        <Tooltip title="Copy Code">
                            <IconButton onClick={() => handleCopyCode(createdMeetingCode)} sx={{ color: "#1976d2" }}>
                                <ContentCopyIcon />
                            </IconButton>
                        </Tooltip>
                    </Box>

                    <Box sx={{ display: "flex", gap: 1.5, mt: 2.5 }}>
                        <Button
                            variant="outlined"
                            fullWidth
                            startIcon={<ContentCopyIcon />}
                            onClick={() => handleCopyCode(createdMeetingCode)}
                            sx={{ textTransform: "none", borderRadius: 2, py: 1 }}
                        >
                            Copy Code
                        </Button>

                        <Button
                            variant="outlined"
                            fullWidth
                            startIcon={<ShareIcon />}
                            onClick={() => handleShareMeeting(createdMeetingCode)}
                            sx={{ textTransform: "none", borderRadius: 2, py: 1 }}
                        >
                            Share Meeting
                        </Button>
                    </Box>
                </DialogContent>

                <DialogActions sx={{ px: 3, pb: 2.5 }}>
                    <Button
                        variant="contained"
                        fullWidth
                        size="large"
                        startIcon={isCreating ? <CircularProgress size={20} color="inherit" /> : <VideocamIcon />}
                        onClick={handleStartCreatedMeeting}
                        disabled={isCreating}
                        sx={{
                            py: 1.2,
                            borderRadius: 2,
                            textTransform: "none",
                            fontWeight: 600,
                            bgcolor: "#1976d2",
                            "&:hover": { bgcolor: "#1565c0" }
                        }}
                    >
                        Start Meeting
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Notification Toast */}
            <Snackbar
                open={snackbar.open}
                autoHideDuration={3500}
                onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
                anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
            >
                <Alert
                    onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
                    severity={snackbar.severity}
                    variant="filled"
                    sx={{ width: "100%", borderRadius: 2 }}
                >
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </Box>
    );
}

export default withAuth(HomeComponent);