import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import {
    Box,
    Button,
    IconButton,
    TextField,
    Typography,
    Card,
    CardContent,
    Alert,
    Tooltip,
    InputAdornment,
    CircularProgress,
    Avatar
} from '@mui/material';
import VideocamIcon from '@mui/icons-material/Videocam';
import VideocamOffIcon from '@mui/icons-material/VideocamOff';
import MicIcon from '@mui/icons-material/Mic';
import MicOffIcon from '@mui/icons-material/MicOff';
import KeyboardIcon from '@mui/icons-material/Keyboard';
import PersonIcon from '@mui/icons-material/Person';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import MeetingRoomIcon from '@mui/icons-material/MeetingRoom';
import server from '../environment';

export default function GuestLobby() {
    const navigate = useNavigate();
    const location = useLocation();

    // Inputs
    const [meetingCode, setMeetingCode] = useState('');
    const [guestName, setGuestName] = useState('');

    useEffect(() => {
        const queryParams = new URLSearchParams(location.search);
        const codeParam = queryParams.get('code') || queryParams.get('meetingCode');
        if (codeParam) {
            setMeetingCode(codeParam.trim());
        } else if (location.state?.meetingCode) {
            setMeetingCode(location.state.meetingCode.trim());
        }
    }, [location]);

    // Device toggles - Camera and mic OFF by default (access camera/mic only when explicitly requested)
    const [isCameraOn, setIsCameraOn] = useState(false);
    const [isMicOn, setIsMicOn] = useState(false);

    // Status / Errors
    const [isValidating, setIsValidating] = useState(false);
    const [formError, setFormError] = useState('');
    const [cameraError, setCameraError] = useState('');
    const [micError, setMicError] = useState('');

    // Stream and video refs
    const videoPreviewRef = useRef(null);
    const streamRef = useRef(null);

    // Stop local camera stream
    const stopCamera = () => {
        if (streamRef.current) {
            try {
                streamRef.current.getTracks().forEach((track) => track.stop());
            } catch (err) {
                console.error("Error stopping tracks:", err);
            }
            streamRef.current = null;
        }
        if (videoPreviewRef.current) {
            videoPreviewRef.current.srcObject = null;
        }
    };

    // Start local camera stream for preview
    const startCamera = async () => {
        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                setCameraError("Camera is not supported on this browser.");
                setIsCameraOn(false);
                return;
            }

            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 640 }, height: { ideal: 480 } },
                audio: false
            });

            streamRef.current = stream;
            if (videoPreviewRef.current) {
                videoPreviewRef.current.srcObject = stream;
            }
            setCameraError('');
        } catch (err) {
            console.error("Camera access error:", err);
            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                setCameraError("Camera permission denied. You can still join with camera off.");
            } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
                setCameraError("No camera found on this device.");
            } else {
                setCameraError("Unable to access camera: " + (err.message || "Unknown error"));
            }
            setIsCameraOn(false);
        }
    };

    // Camera is OFF by default. Clean up tracks on unmount.
    useEffect(() => {
        return () => {
            stopCamera();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Toggle Camera
    const handleToggleCamera = () => {
        if (isCameraOn) {
            stopCamera();
            setIsCameraOn(false);
            setCameraError('');
        } else {
            setIsCameraOn(true);
            startCamera();
        }
    };

    // Toggle Microphone
    const handleToggleMic = async () => {
        if (!isMicOn) {
            try {
                if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                    const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    audioStream.getTracks().forEach((track) => track.stop());
                }
                setIsMicOn(true);
                setMicError('');
            } catch (err) {
                console.error("Mic access error:", err);
                if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                    setMicError("Microphone permission denied.");
                } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
                    setMicError("No microphone found on this device.");
                } else {
                    setMicError("Unable to access microphone.");
                }
                setIsMicOn(false);
            }
        } else {
            setIsMicOn(false);
            setMicError('');
        }
    };

    // Handler to Join Meeting
    const handleJoinMeeting = async () => {
        let code = meetingCode.trim();
        const name = guestName.trim();

        if (!code) {
            setFormError("Please enter a meeting code.");
            return;
        }

        if (!name) {
            setFormError("Please enter your name.");
            return;
        }

        // Support pasted meeting URL (e.g. http://localhost:3000/abc-defg-hij)
        if (code.includes("/")) {
            const parts = code.split("/").filter(Boolean);
            code = parts[parts.length - 1];
        }

        setFormError('');
        setIsValidating(true);

        try {
            const baseUrl = server.replace(/\/+$/, '');
            const response = await axios.get(`${baseUrl}/api/v1/users/validate_meeting/${encodeURIComponent(code)}`);

            if (response.data && response.data.exists) {
                // Stop camera preview before navigating
                stopCamera();

                // Navigate to meeting room with guest state
                navigate(`/${response.data.meetingCode || code}`, {
                    state: {
                        username: name,
                        videoEnabled: isCameraOn,
                        audioEnabled: isMicOn,
                        fromGuestLobby: true
                    }
                });
            } else {
                setFormError("Meeting not found. Please verify your meeting code.");
            }
        } catch (err) {
            console.error("Meeting validation error:", err);
            if (err.response && err.response.status === 404) {
                setFormError("Meeting not found. Please check your meeting code and try again.");
            } else if (err.response && err.response.data && err.response.data.message) {
                setFormError(err.response.data.message);
            } else {
                setFormError("Unable to connect to the meeting server. Please check your internet connection.");
            }
        } finally {
            setIsValidating(false);
        }
    };

    // Get initials for avatar
    const getInitials = (name) => {
        if (!name) return "";
        const parts = name.trim().split(" ");
        if (parts.length >= 2) {
            return (parts[0][0] + parts[1][0]).toUpperCase();
        }
        return name.slice(0, 2).toUpperCase();
    };

    return (
        <Box sx={{ minHeight: "100vh", bgcolor: "#f8f9fa", display: "flex", flexDirection: "column" }}>
            {/* Top Navigation / Brand */}
            <Box
                sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    px: { xs: 2, md: 4 },
                    py: 1.5,
                    bgcolor: "#ffffff",
                    borderBottom: "1px solid #e0e0e0"
                }}
            >
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                    <VideocamIcon sx={{ color: "#1976d2", fontSize: 32 }} />
                    <Typography variant="h6" sx={{ fontWeight: 600, color: "#1a1a1a" }}>
                        ConnectX
                    </Typography>
                </Box>

                <Tooltip title="Back to Home">
                    <Button
                        variant="outlined"
                        startIcon={<ArrowBackIcon />}
                        onClick={() => {
                            stopCamera();
                            navigate("/");
                        }}
                        size="small"
                        sx={{ textTransform: "none", borderRadius: 2 }}
                    >
                        Back
                    </Button>
                </Tooltip>
            </Box>

            {/* Main Content Area */}
            <Box
                sx={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    px: { xs: 2, sm: 3, md: 6 },
                    py: { xs: 3, md: 5 }
                }}
            >
                {/* Header Title */}
                <Box sx={{ textAlign: "center", mb: { xs: 2.5, md: 4 }, maxWidth: 600 }}>
                    <Typography
                        variant="h4"
                        sx={{
                            fontWeight: 700,
                            color: "#202124",
                            fontSize: { xs: "1.75rem", sm: "2.1rem", md: "2.4rem" },
                            mb: 1
                        }}
                    >
                        Enter into Lobby
                    </Typography>
                    <Typography variant="body1" sx={{ color: "#5f6368", fontSize: { xs: "0.95rem", md: "1.05rem" } }}>
                        Check your camera and microphone before joining the meeting
                    </Typography>
                </Box>

                {/* Main 2-Section Container */}
                <Box
                    sx={{
                        width: "100%",
                        maxWidth: 960,
                        display: "flex",
                        flexDirection: { xs: "column-reverse", md: "row" },
                        alignItems: { xs: "center", md: "flex-start" },
                        gap: { xs: 3, md: 5 }
                    }}
                >
                    {/* LEFT SECTION — GUEST JOIN DETAILS */}
                    <Box sx={{ flex: 1, width: "100%", maxWidth: { xs: "100%", md: 440 } }}>
                        <Card
                            elevation={3}
                            sx={{
                                borderRadius: 3,
                                border: "1px solid #e3e8ee",
                                p: { xs: 1, sm: 1.5 }
                            }}
                        >
                            <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
                                <Typography variant="h6" sx={{ fontWeight: 600, color: "#202124", mb: 2.5 }}>
                                    Join Details
                                </Typography>

                                {formError && (
                                    <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
                                        {formError}
                                    </Alert>
                                )}

                                {cameraError && (
                                    <Alert severity="warning" sx={{ mb: 2, borderRadius: 2 }}>
                                        {cameraError}
                                    </Alert>
                                )}

                                {micError && (
                                    <Alert severity="warning" sx={{ mb: 2, borderRadius: 2 }}>
                                        {micError}
                                    </Alert>
                                )}

                                {/* Meeting Code Input */}
                                <Box sx={{ mb: 2.5 }}>
                                    <Typography variant="body2" sx={{ fontWeight: 600, color: "#3c4043", mb: 0.8 }}>
                                        Meeting code
                                    </Typography>
                                    <TextField
                                        fullWidth
                                        placeholder="Enter meeting code"
                                        value={meetingCode}
                                        onChange={(e) => {
                                            setMeetingCode(e.target.value);
                                            if (formError) setFormError('');
                                        }}
                                        size="medium"
                                        InputProps={{
                                            startAdornment: (
                                                <InputAdornment position="start">
                                                    <KeyboardIcon sx={{ color: "#757575" }} />
                                                </InputAdornment>
                                            )
                                        }}
                                    />
                                </Box>

                                {/* Guest Name Input */}
                                <Box sx={{ mb: 3 }}>
                                    <Typography variant="body2" sx={{ fontWeight: 600, color: "#3c4043", mb: 0.8 }}>
                                        Your name
                                    </Typography>
                                    <TextField
                                        fullWidth
                                        placeholder="Enter your name"
                                        value={guestName}
                                        onChange={(e) => {
                                            setGuestName(e.target.value);
                                            if (formError) setFormError('');
                                        }}
                                        size="medium"
                                        InputProps={{
                                            startAdornment: (
                                                <InputAdornment position="start">
                                                    <PersonIcon sx={{ color: "#757575" }} />
                                                </InputAdornment>
                                            )
                                        }}
                                    />
                                </Box>

                                {/* Media Controls (Mic & Camera Toggles) */}
                                <Box sx={{ mb: 3.5 }}>
                                    <Typography variant="body2" sx={{ fontWeight: 600, color: "#3c4043", mb: 1 }}>
                                        Device Settings
                                    </Typography>
                                    <Box sx={{ display: "flex", gap: 2 }}>
                                        {/* Microphone Toggle */}
                                        <Button
                                            variant={isMicOn ? "contained" : "outlined"}
                                            color={isMicOn ? "primary" : "error"}
                                            startIcon={isMicOn ? <MicIcon /> : <MicOffIcon />}
                                            onClick={handleToggleMic}
                                            fullWidth
                                            sx={{
                                                py: 1.2,
                                                borderRadius: 2,
                                                textTransform: "none",
                                                fontWeight: 600
                                            }}
                                        >
                                            {isMicOn ? "Mic ON" : "Mic OFF"}
                                        </Button>

                                        {/* Camera Toggle */}
                                        <Button
                                            variant={isCameraOn ? "contained" : "outlined"}
                                            color={isCameraOn ? "primary" : "error"}
                                            startIcon={isCameraOn ? <VideocamIcon /> : <VideocamOffIcon />}
                                            onClick={handleToggleCamera}
                                            fullWidth
                                            sx={{
                                                py: 1.2,
                                                borderRadius: 2,
                                                textTransform: "none",
                                                fontWeight: 600
                                            }}
                                        >
                                            {isCameraOn ? "Camera ON" : "Camera OFF"}
                                        </Button>
                                    </Box>
                                </Box>

                                {/* Join Meeting Button */}
                                <Button
                                    variant="contained"
                                    size="large"
                                    fullWidth
                                    startIcon={isValidating ? <CircularProgress size={22} color="inherit" /> : <MeetingRoomIcon />}
                                    onClick={handleJoinMeeting}
                                    disabled={isValidating}
                                    sx={{
                                        py: 1.4,
                                        borderRadius: 2.5,
                                        textTransform: "none",
                                        fontWeight: 700,
                                        fontSize: "1.05rem",
                                        bgcolor: "#1976d2",
                                        "&:hover": { bgcolor: "#1565c0" }
                                    }}
                                >
                                    {isValidating ? "Validating Meeting..." : "Join Meeting"}
                                </Button>
                            </CardContent>
                        </Card>
                    </Box>

                    {/* RIGHT SECTION — CAMERA PREVIEW */}
                    <Box sx={{ flex: 1.1, width: "100%", maxWidth: { xs: "100%", md: 480 } }}>
                        <Card
                            elevation={3}
                            sx={{
                                borderRadius: 3,
                                bgcolor: "#202124",
                                overflow: "hidden",
                                border: "1px solid #3c4043"
                            }}
                        >
                            <Box
                                sx={{
                                    position: "relative",
                                    width: "100%",
                                    aspectRatio: { xs: "16 / 10", sm: "16 / 9" },
                                    minHeight: 260,
                                    bgcolor: "#202124",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center"
                                }}
                            >
                                {/* Live Camera Video Feed */}
                                <video
                                    ref={videoPreviewRef}
                                    autoPlay
                                    playsInline
                                    muted
                                    style={{
                                        width: "100%",
                                        height: "100%",
                                        objectFit: "cover",
                                        transform: "scaleX(-1)",
                                        display: isCameraOn ? "block" : "none"
                                    }}
                                />

                                {/* Camera OFF Placeholder */}
                                {!isCameraOn && (
                                    <Box
                                        sx={{
                                            display: "flex",
                                            flexDirection: "column",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            color: "white"
                                        }}
                                    >
                                        <Avatar
                                            sx={{
                                                width: 80,
                                                height: 80,
                                                bgcolor: "#3c4043",
                                                color: "#ffffff",
                                                fontSize: "1.8rem",
                                                fontWeight: 600,
                                                mb: 1.5,
                                                border: "2px solid #5f6368"
                                            }}
                                        >
                                            {guestName.trim() ? getInitials(guestName) : <PersonIcon sx={{ fontSize: 44 }} />}
                                        </Avatar>
                                        <Typography variant="body1" sx={{ color: "#e8eaed", fontWeight: 500 }}>
                                            Camera is off
                                        </Typography>
                                    </Box>
                                )}

                                {/* Bottom Overlay Badges */}
                                <Box
                                    sx={{
                                        position: "absolute",
                                        bottom: 12,
                                        left: 12,
                                        bgcolor: "rgba(0, 0, 0, 0.65)",
                                        color: "white",
                                        px: 1.5,
                                        py: 0.5,
                                        borderRadius: 1.5,
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 0.8,
                                        backdropFilter: "blur(4px)"
                                    }}
                                >
                                    <Typography variant="body2" sx={{ fontWeight: 500, fontSize: "0.85rem" }}>
                                        {guestName.trim() || "You"}
                                    </Typography>
                                </Box>

                                {/* Mic Status Indicator Badge */}
                                <Box
                                    sx={{
                                        position: "absolute",
                                        bottom: 12,
                                        right: 12,
                                        bgcolor: isMicOn ? "rgba(25, 118, 210, 0.85)" : "rgba(211, 47, 47, 0.85)",
                                        color: "white",
                                        p: 0.7,
                                        borderRadius: "50%",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        backdropFilter: "blur(4px)"
                                    }}
                                >
                                    {isMicOn ? <MicIcon fontSize="small" /> : <MicOffIcon fontSize="small" />}
                                </Box>
                            </Box>

                            {/* Camera Preview Footer Controls */}
                            <Box
                                sx={{
                                    p: 1.5,
                                    bgcolor: "#17181b",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    px: 2.5
                                }}
                            >
                                <Typography variant="caption" sx={{ color: "#9aa0a6" }}>
                                    {isCameraOn ? "Live Camera Feed (Mirrored)" : "Camera Disabled"}
                                </Typography>

                                <Box sx={{ display: "flex", gap: 1 }}>
                                    <Tooltip title={isMicOn ? "Mute Microphone" : "Unmute Microphone"}>
                                        <IconButton
                                            size="small"
                                            onClick={handleToggleMic}
                                            sx={{
                                                bgcolor: isMicOn ? "#3c4043" : "#d32f2f",
                                                color: "white",
                                                "&:hover": { bgcolor: isMicOn ? "#5f6368" : "#c62828" }
                                            }}
                                        >
                                            {isMicOn ? <MicIcon fontSize="small" /> : <MicOffIcon fontSize="small" />}
                                        </IconButton>
                                    </Tooltip>

                                    <Tooltip title={isCameraOn ? "Turn Camera Off" : "Turn Camera On"}>
                                        <IconButton
                                            size="small"
                                            onClick={handleToggleCamera}
                                            sx={{
                                                bgcolor: isCameraOn ? "#3c4043" : "#d32f2f",
                                                color: "white",
                                                "&:hover": { bgcolor: isCameraOn ? "#5f6368" : "#c62828" }
                                            }}
                                        >
                                            {isCameraOn ? <VideocamIcon fontSize="small" /> : <VideocamOffIcon fontSize="small" />}
                                        </IconButton>
                                    </Tooltip>
                                </Box>
                            </Box>
                        </Card>
                    </Box>
                </Box>
            </Box>
        </Box>
    );
}
