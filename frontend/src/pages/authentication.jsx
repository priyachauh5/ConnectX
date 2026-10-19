import React, { useState, useEffect, useContext } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Box,
  Button,
  Card,
  CardContent,
  CssBaseline,
  TextField,
  Typography,
  Alert,
  Snackbar,
  InputAdornment,
  IconButton,
  CircularProgress,
  Tooltip,
} from "@mui/material";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import VideocamIcon from "@mui/icons-material/Videocam";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import PersonOutlineIcon from "@mui/icons-material/PersonOutline";
import BadgeOutlinedIcon from "@mui/icons-material/BadgeOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import PersonAddOutlinedIcon from "@mui/icons-material/PersonAddOutlined";
import { AuthContext } from "../contexts/AuthContext";

const authTheme = createTheme({
  palette: {
    primary: {
      main: "#1976d2",
      dark: "#1565c0",
      light: "#42a5f5",
    },
    text: {
      primary: "#202124",
      secondary: "#5f6368",
    },
    background: {
      default: "#f8f9fa",
      paper: "#ffffff",
    },
  },
  typography: {
    fontFamily: [
      "-apple-system",
      "BlinkMacSystemFont",
      '"Segoe UI"',
      "Roboto",
      '"Helvetica Neue"',
      "Arial",
      "sans-serif",
    ].join(","),
  },
  shape: {
    borderRadius: 8,
  },
});

export default function Authentication() {
  const navigate = useNavigate();
  const location = useLocation();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [formState, setFormState] = useState(location.state?.formState ?? 0); // 0 = Login, 1 = Signup
  const [open, setOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (location.state?.formState !== undefined) {
      setFormState(location.state.formState);
      setError("");
    }
  }, [location.state]);

  const { handleRegister, handleLogin } = useContext(AuthContext);

  const handleAuth = async (e) => {
    if (e && e.preventDefault) {
      e.preventDefault();
    }
    try {
      setIsLoading(true);
      if (formState === 0) {
        if (!username.trim() || !password.trim()) {
          setError("Please enter both username and password");
          setIsLoading(false);
          return;
        }
        await handleLogin(username, password);
      } else {
        if (!name.trim() || !username.trim() || !password.trim()) {
          setError("Please fill in all fields");
          setIsLoading(false);
          return;
        }
        const result = await handleRegister(name, username, password);
        setUsername("");
        setPassword("");
        setName("");
        setError("");
        setFormState(0);
        setMessage(result || "User Registered");
        setOpen(true);
      }
    } catch (err) {
      const msg = err?.response?.data?.message || "Something went wrong";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ThemeProvider theme={authTheme}>
      <CssBaseline />

      {/* Main Page Layout Container */}
      <Box
        sx={{
          minHeight: "100vh",
          bgcolor: "#f8f9fa",
          background:
            "radial-gradient(ellipse at 50% 0%, rgba(25, 118, 210, 0.05) 0%, rgba(248, 249, 250, 1) 75%)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Top Navigation / Brand (consistent with Join as Guest header) */}
        <Box
          component="header"
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            px: { xs: 2, sm: 3, md: 4 },
            py: 1.5,
            bgcolor: "#ffffff",
            borderBottom: "1px solid #e0e0e0",
          }}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              cursor: "pointer",
              userSelect: "none",
            }}
            onClick={() => navigate("/")}
          >
            <VideocamIcon sx={{ color: "#1976d2", fontSize: 32 }} />
            <Typography variant="h6" sx={{ fontWeight: 600, color: "#1a1a1a" }}>
              ConnectX
            </Typography>
          </Box>

          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <Button
              variant="outlined"
              size="small"
              onClick={() => navigate("/guest")}
              sx={{
                textTransform: "none",
                borderRadius: 2,
                borderColor: "#dadce0",
                color: "#3c4043",
                fontWeight: 500,
                display: { xs: "none", sm: "inline-flex" },
                "&:hover": {
                  borderColor: "#1976d2",
                  bgcolor: "rgba(25, 118, 210, 0.04)",
                },
              }}
            >
              Join as Guest
            </Button>

            <Tooltip title="Back to Home">
              <Button
                variant="outlined"
                startIcon={<ArrowBackIcon />}
                onClick={() => navigate("/")}
                size="small"
                sx={{
                  textTransform: "none",
                  borderRadius: 2,
                  borderColor: "#dadce0",
                  color: "#3c4043",
                  fontWeight: 500,
                  "&:hover": {
                    borderColor: "#1976d2",
                    bgcolor: "rgba(25, 118, 210, 0.04)",
                  },
                }}
              >
                Back
              </Button>
            </Tooltip>
          </Box>
        </Box>

        {/* Centered Authentication Form Container */}
        <Box
          component="main"
          sx={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            px: { xs: 2, sm: 3 },
            py: { xs: 4, sm: 6 },
          }}
        >
          <Card
            elevation={3}
            sx={{
              width: "100%",
              maxWidth: { xs: "100%", sm: 460 },
              borderRadius: 3,
              border: "1px solid #e3e8ee",
              bgcolor: "#ffffff",
              boxShadow: "0 4px 20px rgba(0, 0, 0, 0.05)",
            }}
          >
            <CardContent sx={{ p: { xs: 3, sm: 4 } }}>
              {/* Header Icon & Title */}
              <Box
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  textAlign: "center",
                  mb: 3,
                }}
              >
                <Box
                  sx={{
                    width: 52,
                    height: 52,
                    borderRadius: "50%",
                    bgcolor: "#e8f0fe",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#1976d2",
                    mb: 1.8,
                  }}
                >
                  {formState === 0 ? (
                    <LockOutlinedIcon sx={{ fontSize: 26 }} />
                  ) : (
                    <PersonAddOutlinedIcon sx={{ fontSize: 26 }} />
                  )}
                </Box>

                <Typography
                  variant="h5"
                  component="h1"
                  sx={{
                    fontWeight: 700,
                    color: "#202124",
                    fontSize: { xs: "1.45rem", sm: "1.65rem" },
                    mb: 0.5,
                  }}
                >
                  {formState === 0 ? "Welcome back" : "Create your account"}
                </Typography>

                <Typography variant="body2" sx={{ color: "#5f6368" }}>
                  {formState === 0
                    ? "Sign in to continue to ConnectX."
                    : "Join ConnectX and connect with your team."}
                </Typography>
              </Box>

              {/* Segmented Mode Switcher (Sign In / Sign Up) */}
              <Box
                role="tablist"
                aria-label="Authentication mode"
                sx={{
                  display: "flex",
                  bgcolor: "#f1f3f4",
                  borderRadius: 2.5,
                  p: 0.5,
                  mb: 3,
                }}
              >
                <Button
                  role="tab"
                  aria-selected={formState === 0}
                  fullWidth
                  disableElevation
                  variant={formState === 0 ? "contained" : "text"}
                  onClick={() => {
                    setFormState(0);
                    setError("");
                  }}
                  sx={{
                    py: 1,
                    borderRadius: 2,
                    textTransform: "none",
                    fontWeight: 600,
                    fontSize: "0.925rem",
                    bgcolor: formState === 0 ? "#ffffff" : "transparent",
                    color: formState === 0 ? "#1976d2" : "#5f6368",
                    boxShadow:
                      formState === 0 ? "0 1px 3px rgba(0,0,0,0.12)" : "none",
                    "&:hover": {
                      bgcolor:
                        formState === 0 ? "#ffffff" : "rgba(0,0,0,0.04)",
                      color: formState === 0 ? "#1976d2" : "#202124",
                    },
                  }}
                >
                  Sign In
                </Button>
                <Button
                  role="tab"
                  aria-selected={formState === 1}
                  fullWidth
                  disableElevation
                  variant={formState === 1 ? "contained" : "text"}
                  onClick={() => {
                    setFormState(1);
                    setError("");
                  }}
                  sx={{
                    py: 1,
                    borderRadius: 2,
                    textTransform: "none",
                    fontWeight: 600,
                    fontSize: "0.925rem",
                    bgcolor: formState === 1 ? "#ffffff" : "transparent",
                    color: formState === 1 ? "#1976d2" : "#5f6368",
                    boxShadow:
                      formState === 1 ? "0 1px 3px rgba(0,0,0,0.12)" : "none",
                    "&:hover": {
                      bgcolor:
                        formState === 1 ? "#ffffff" : "rgba(0,0,0,0.04)",
                      color: formState === 1 ? "#1976d2" : "#202124",
                    },
                  }}
                >
                  Sign Up
                </Button>
              </Box>

              {/* Error Message Alert */}
              {error && (
                <Alert
                  severity="error"
                  sx={{
                    mb: 2.5,
                    borderRadius: 2,
                    fontSize: "0.875rem",
                    alignItems: "center",
                  }}
                >
                  {error}
                </Alert>
              )}

              {/* Form Element */}
              <Box
                component="form"
                onSubmit={handleAuth}
                noValidate
                sx={{ width: "100%" }}
              >
                {/* Full Name field (Signup only) */}
                {formState === 1 && (
                  <Box sx={{ mb: 2.5 }}>
                    <Typography
                      component="label"
                      htmlFor="auth-fullname"
                      variant="body2"
                      sx={{
                        fontWeight: 600,
                        color: "#3c4043",
                        mb: 0.8,
                        display: "block",
                      }}
                    >
                      Full Name
                    </Typography>
                    <TextField
                      id="auth-fullname"
                      name="fullname"
                      fullWidth
                      required
                      placeholder="Enter your full name"
                      value={name}
                      onChange={(e) => {
                        setName(e.target.value);
                        if (error) setError("");
                      }}
                      autoComplete="name"
                      size="medium"
                      disabled={isLoading}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <BadgeOutlinedIcon
                              sx={{ color: "#757575", fontSize: 20 }}
                            />
                          </InputAdornment>
                        ),
                      }}
                      sx={{
                        "& .MuiOutlinedInput-root": {
                          borderRadius: 2,
                          bgcolor: "#ffffff",
                          "& fieldset": {
                            borderColor: "#dadce0",
                          },
                          "&:hover fieldset": {
                            borderColor: "#1976d2",
                          },
                          "&.Mui-focused fieldset": {
                            borderColor: "#1976d2",
                            borderWidth: 2,
                          },
                        },
                      }}
                    />
                  </Box>
                )}

                {/* Username field */}
                <Box sx={{ mb: 2.5 }}>
                  <Typography
                    component="label"
                    htmlFor="auth-username"
                    variant="body2"
                    sx={{
                      fontWeight: 600,
                      color: "#3c4043",
                      mb: 0.8,
                      display: "block",
                    }}
                  >
                    Username
                  </Typography>
                  <TextField
                    id="auth-username"
                    name="username"
                    fullWidth
                    required
                    placeholder={
                      formState === 0
                        ? "Enter your username"
                        : "Choose a username"
                    }
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value);
                      if (error) setError("");
                    }}
                    autoComplete={formState === 0 ? "username" : "new-username"}
                    size="medium"
                    disabled={isLoading}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <PersonOutlineIcon
                            sx={{ color: "#757575", fontSize: 20 }}
                          />
                        </InputAdornment>
                      ),
                    }}
                    sx={{
                      "& .MuiOutlinedInput-root": {
                        borderRadius: 2,
                        bgcolor: "#ffffff",
                        "& fieldset": {
                          borderColor: "#dadce0",
                        },
                        "&:hover fieldset": {
                          borderColor: "#1976d2",
                        },
                        "&.Mui-focused fieldset": {
                          borderColor: "#1976d2",
                          borderWidth: 2,
                        },
                      },
                    }}
                  />
                </Box>

                {/* Password field */}
                <Box sx={{ mb: 3 }}>
                  <Typography
                    component="label"
                    htmlFor="auth-password"
                    variant="body2"
                    sx={{
                      fontWeight: 600,
                      color: "#3c4043",
                      mb: 0.8,
                      display: "block",
                    }}
                  >
                    Password
                  </Typography>
                  <TextField
                    id="auth-password"
                    name="password"
                    fullWidth
                    required
                    type={showPassword ? "text" : "password"}
                    placeholder={
                      formState === 0
                        ? "Enter your password"
                        : "Create a password"
                    }
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (error) setError("");
                    }}
                    autoComplete={
                      formState === 0 ? "current-password" : "new-password"
                    }
                    size="medium"
                    disabled={isLoading}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <LockOutlinedIcon
                            sx={{ color: "#757575", fontSize: 20 }}
                          />
                        </InputAdornment>
                      ),
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton
                            aria-label={
                              showPassword ? "Hide password" : "Show password"
                            }
                            onClick={() => setShowPassword(!showPassword)}
                            edge="end"
                            size="small"
                            sx={{ color: "#757575" }}
                          >
                            {showPassword ? (
                              <VisibilityOffOutlinedIcon fontSize="small" />
                            ) : (
                              <VisibilityOutlinedIcon fontSize="small" />
                            )}
                          </IconButton>
                        </InputAdornment>
                      ),
                    }}
                    sx={{
                      "& .MuiOutlinedInput-root": {
                        borderRadius: 2,
                        bgcolor: "#ffffff",
                        "& fieldset": {
                          borderColor: "#dadce0",
                        },
                        "&:hover fieldset": {
                          borderColor: "#1976d2",
                        },
                        "&.Mui-focused fieldset": {
                          borderColor: "#1976d2",
                          borderWidth: 2,
                        },
                      },
                    }}
                  />
                </Box>

                {/* Submit Action Button */}
                <Button
                  type="submit"
                  fullWidth
                  variant="contained"
                  size="large"
                  disabled={isLoading}
                  startIcon={
                    isLoading ? (
                      <CircularProgress size={20} color="inherit" />
                    ) : null
                  }
                  sx={{
                    py: 1.4,
                    borderRadius: 2.5,
                    textTransform: "none",
                    fontWeight: 700,
                    fontSize: "1.05rem",
                    bgcolor: "#1976d2",
                    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.12)",
                    "&:hover": {
                      bgcolor: "#1565c0",
                      boxShadow: "0 2px 6px rgba(25, 118, 210, 0.3)",
                    },
                    "&:disabled": {
                      bgcolor: "rgba(25, 118, 210, 0.6)",
                      color: "#ffffff",
                    },
                  }}
                >
                  {isLoading
                    ? formState === 0
                      ? "Signing In..."
                      : "Creating Account..."
                    : formState === 0
                    ? "Sign In"
                    : "Create Account"}
                </Button>

                {/* Secondary Navigation Link */}
                <Box sx={{ mt: 3, textAlign: "center" }}>
                  <Typography
                    variant="body2"
                    sx={{ color: "#5f6368", fontSize: "0.9rem" }}
                  >
                    {formState === 0 ? (
                      <>
                        Don&apos;t have an account?{" "}
                        <Button
                          variant="text"
                          onClick={() => {
                            setFormState(1);
                            setError("");
                          }}
                          sx={{
                            p: 0,
                            minWidth: "auto",
                            textTransform: "none",
                            fontWeight: 600,
                            color: "#1976d2",
                            verticalAlign: "baseline",
                            fontSize: "inherit",
                            "&:hover": {
                              bgcolor: "transparent",
                              textDecoration: "underline",
                            },
                          }}
                        >
                          Create account
                        </Button>
                      </>
                    ) : (
                      <>
                        Already have an account?{" "}
                        <Button
                          variant="text"
                          onClick={() => {
                            setFormState(0);
                            setError("");
                          }}
                          sx={{
                            p: 0,
                            minWidth: "auto",
                            textTransform: "none",
                            fontWeight: 600,
                            color: "#1976d2",
                            verticalAlign: "baseline",
                            fontSize: "inherit",
                            "&:hover": {
                              bgcolor: "transparent",
                              textDecoration: "underline",
                            },
                          }}
                        >
                          Sign in
                        </Button>
                      </>
                    )}
                  </Typography>
                </Box>

                {/* Secondary Prompt to Join as Guest */}
                <Box
                  sx={{
                    mt: 3,
                    pt: 2.5,
                    borderTop: "1px solid #edf2f7",
                    textAlign: "center",
                  }}
                >
                  <Typography
                    variant="body2"
                    sx={{ color: "#5f6368", fontSize: "0.85rem" }}
                  >
                    Looking to join a meeting directly?{" "}
                    <Button
                      variant="text"
                      onClick={() => navigate("/guest")}
                      sx={{
                        p: 0,
                        minWidth: "auto",
                        textTransform: "none",
                        fontWeight: 600,
                        color: "#1976d2",
                        verticalAlign: "baseline",
                        fontSize: "inherit",
                        "&:hover": {
                          bgcolor: "transparent",
                          textDecoration: "underline",
                        },
                      }}
                    >
                      Join as Guest
                    </Button>
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Box>

        {/* Feedback Snackbar */}
        <Snackbar
          open={open}
          autoHideDuration={4000}
          onClose={() => setOpen(false)}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        >
          <Alert
            onClose={() => setOpen(false)}
            severity="success"
            variant="filled"
            sx={{ width: "100%", borderRadius: 2, fontWeight: 500 }}
          >
            {message}
          </Alert>
        </Snackbar>
      </Box>
    </ThemeProvider>
  );
}
