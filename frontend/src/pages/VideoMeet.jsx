import React, { useEffect, useRef, useState, useCallback } from 'react';
import io from 'socket.io-client';
import axios from 'axios';
import {
    Badge,
    IconButton,
    TextField,
    Box,
    Typography,
    Card,
    CardContent,
    Button,
    Switch,
    FormControlLabel,
    Tooltip,
    Snackbar,
    Alert,
    CircularProgress
} from '@mui/material';
import VideocamIcon from '@mui/icons-material/Videocam';
import VideocamOffIcon from '@mui/icons-material/VideocamOff';
import CallEndIcon from '@mui/icons-material/CallEnd';
import MicIcon from '@mui/icons-material/Mic';
import MicOffIcon from '@mui/icons-material/MicOff';
import ScreenShareIcon from '@mui/icons-material/ScreenShare';
import StopScreenShareIcon from '@mui/icons-material/StopScreenShare';
import ChatIcon from '@mui/icons-material/Chat';
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import LockPersonIcon from '@mui/icons-material/LockPerson';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import { useLocation, useParams, useNavigate } from 'react-router-dom';
import styles from '../styles/videoComponent.module.css';
import server from '../environment';

const server_url = server.replace(/\/+$/, '');

const peerConfigConnections = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

export default function VideoMeetComponent() {
    const location = useLocation();
    const params = useParams();
    const navigate = useNavigate();

    // Extract normalized meeting code
    const rawMeetingCode = params.url || location.pathname.split('/').filter(Boolean).pop() || '';
    const [meetingCode, setMeetingCode] = useState(rawMeetingCode.trim());

    // Location state from guest lobby if redirected
    const incomingState = location.state;
    const fromGuestLobby = incomingState?.fromGuestLobby || false;
    const initialGuestName = incomingState?.username || '';
    const initialVideoOn = incomingState?.videoEnabled || false;
    const initialAudioOn = incomingState?.audioEnabled || false;

    // Meeting status & Host Access Control
    const [meetingLoading, setMeetingLoading] = useState(true);
    const [meetingNotFound, setMeetingNotFound] = useState(false);
    const [isHost, setIsHost] = useState(false);
    const [allowGuests, setAllowGuests] = useState(true);
    const [isGuestBlocked, setIsGuestBlocked] = useState(false);
    const [hostUpdating, setHostUpdating] = useState(false);

    // Media states - OFF BY DEFAULT unless requested from lobby
    const [video, setVideo] = useState(initialVideoOn);
    const [audio, setAudio] = useState(initialAudioOn);
    const [screen, setScreen] = useState(false);
    const screenAvailable = Boolean(navigator.mediaDevices?.getDisplayMedia);

    // Name / Lobby state
    const [askForUsername, setAskForUsername] = useState(!fromGuestLobby && !localStorage.getItem('token'));
    const [username, setUsername] = useState(initialGuestName);

    // UI states
    const [showChat, setShowChat] = useState(false);
    const [messages, setMessages] = useState([]);
    const [message, setMessage] = useState('');
    const [newMessages, setNewMessages] = useState(0);
    const [toast, setToast] = useState({ open: false, message: '', severity: 'info' });

    // Authoritative participant list from server
    const [participants, setParticipants] = useState([]);

    // Video streams / remote peer tile state for rendering
    const [videos, setVideos] = useState([]);

    // Live clock for footer
    const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

    // Core WebRTC Refs
    const socketRef = useRef(null);
    const socketIdRef = useRef(null);
    const meetingCodeRef = useRef(meetingCode);
    const localVideoref = useRef(null);
    const localStreamRef = useRef(null);
    const screenStreamRef = useRef(null);
    const connectionsRef = useRef({});
    const iceCandidateQueueRef = useRef({});
    const remoteStreamsRef = useRef({});
    const remoteVideoRefs = useRef({});
    const peerNamesRef = useRef({});
    const peerMediaStatesRef = useRef({});
    const usernameRef = useRef(initialGuestName);
    const videoRef = useRef([]);
    const chatEndRef = useRef(null);

    // Synchronize username and meetingCode refs
    useEffect(() => {
        usernameRef.current = username;
    }, [username]);

    useEffect(() => {
        meetingCodeRef.current = meetingCode;
    }, [meetingCode]);

    // Keep videoRef in sync with videos state
    useEffect(() => {
        videoRef.current = videos;
    }, [videos]);

    // Clock ticker
    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    // Auto-scroll chat to latest message
    useEffect(() => {
        if (showChat && chatEndRef.current) {
            chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, showChat]);

    // Color generator for avatar initials
    const getAvatarColor = useCallback((name) => {
        const colors = ['#1976d2', '#2e7d32', '#d32f2f', '#7b1fa2', '#0288d1', '#e65100', '#00796b', '#c2185b'];
        if (!name) return colors[0];
        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = name.charCodeAt(i) + ((hash << 5) - hash);
        }
        return colors[Math.abs(hash) % colors.length];
    }, []);

    // Initials generator
    const getInitials = useCallback((name) => {
        if (!name) return '?';
        const parts = name.trim().split(' ');
        if (parts.length >= 2) {
            return (parts[0][0] + parts[1][0]).toUpperCase();
        }
        return name.slice(0, 2).toUpperCase();
    }, []);

    // Validate meeting and check host status
    const validateMeetingAndHost = useCallback(async () => {
        const codeToValidate = (rawMeetingCode || meetingCode).trim();
        if (!codeToValidate) {
            setMeetingNotFound(true);
            setMeetingLoading(false);
            return;
        }

        try {
            const token = localStorage.getItem('token');
            let currentUser = null;

            if (token) {
                try {
                    const userRes = await axios.get(`${server_url}/api/v1/users/get_user_details`, {
                        params: { token }
                    });
                    if (userRes.data) {
                        currentUser = userRes.data;
                        if (!usernameRef.current) {
                            setUsername(userRes.data.name || userRes.data.username);
                            usernameRef.current = userRes.data.name || userRes.data.username;
                        }
                    }
                } catch (e) {
                    console.warn('[WebRTC] Could not fetch user details with token', e);
                }
            }

            const res = await axios.get(`${server_url}/api/v1/users/validate_meeting/${encodeURIComponent(codeToValidate)}`);
            if (res.data && res.data.exists) {
                const canonicalMeetingCode = res.data.meetingCode || codeToValidate;
                setMeetingCode(canonicalMeetingCode);
                meetingCodeRef.current = canonicalMeetingCode;

                const meetingAllowGuests = res.data.allowGuests !== false;
                const meetingHostUsername = res.data.hostUsername;

                setAllowGuests(meetingAllowGuests);

                const userIsMeetingHost = Boolean(currentUser && meetingHostUsername && currentUser.username === meetingHostUsername);
                setIsHost(userIsMeetingHost);

                if (!userIsMeetingHost && !meetingAllowGuests) {
                    setIsGuestBlocked(true);
                } else {
                    setIsGuestBlocked(false);
                }

                if (userIsMeetingHost || fromGuestLobby || currentUser) {
                    setAskForUsername(false);
                }
            } else {
                setMeetingNotFound(true);
            }
        } catch (err) {
            console.error('[WebRTC] Validate meeting error:', err);
            if (err.response && err.response.status === 404) {
                setMeetingNotFound(true);
            }
        } finally {
            setMeetingLoading(false);
        }
    }, [rawMeetingCode, meetingCode, fromGuestLobby]);

    // Initial load
    useEffect(() => {
        validateMeetingAndHost();
    }, [validateMeetingAndHost]);

    // Polling fallback for blocked guests
    useEffect(() => {
        if (!isGuestBlocked) return;
        const interval = setInterval(async () => {
            try {
                const currentCode = meetingCodeRef.current || meetingCode;
                const res = await axios.get(`${server_url}/api/v1/users/validate_meeting/${encodeURIComponent(currentCode)}`);
                if (res.data && res.data.allowGuests !== false) {
                    setIsGuestBlocked(false);
                    setAllowGuests(true);
                    setToast({ open: true, message: 'Host has admitted guests! You may now join.', severity: 'success' });
                }
            } catch (e) {
                console.error('[WebRTC] Error polling meeting guest status:', e);
            }
        }, 3000);

        return () => clearInterval(interval);
    }, [isGuestBlocked, meetingCode]);

    // Chat message received handler
    const addMessage = useCallback((data, sender, socketIdSender, time) => {
        setMessages((prevMessages) => [
            ...prevMessages,
            {
                sender,
                data,
                time: time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            }
        ]);
        if (socketIdSender !== socketIdRef.current) {
            setNewMessages((prev) => prev + 1);
        }
    }, []);

    // Broadcast media state changes to all peers
    const broadcastMediaState = useCallback((newVideoState, newAudioState, newScreenState) => {
        for (let peerId in connectionsRef.current) {
            if (socketRef.current) {
                socketRef.current.emit(
                    'signal',
                    peerId,
                    JSON.stringify({
                        type: 'media-toggle',
                        isVideoOn: newVideoState,
                        isAudioOn: newAudioState,
                        isScreenSharing: newScreenState,
                        userName: usernameRef.current || username || 'Participant'
                    })
                );
            }
        }
    }, [username]);

    // Stop Screen Sharing Helper
    const stopScreenShare = useCallback(() => {
        console.log('[WebRTC] Stopping screen share');
        if (screenStreamRef.current) {
            screenStreamRef.current.getTracks().forEach((track) => {
                try { track.stop(); } catch (e) {}
            });
            screenStreamRef.current = null;
        }
        setScreen(false);

        const localStream = localStreamRef.current;
        const cameraTrack = localStream?.getVideoTracks().find((t) => t.readyState === 'live');

        if (video && cameraTrack) {
            console.log('[WebRTC] Restoring camera track after screen share');
            for (let id in connectionsRef.current) {
                const pc = connectionsRef.current[id];
                if (pc.getSenders) {
                    const videoSender = pc.getSenders().find((s) => (s.track ? s.track.kind === 'video' : s.kind === 'video'));
                    if (videoSender) {
                        videoSender.replaceTrack(cameraTrack).catch((err) => console.error('[WebRTC] Error restoring camera track:', err));
                    }
                }
            }
            if (localVideoref.current) {
                localVideoref.current.srcObject = localStream;
            }
            broadcastMediaState(true, audio, false);
        } else {
            console.log('[WebRTC] Camera is off, resetting video sender to null');
            for (let id in connectionsRef.current) {
                const pc = connectionsRef.current[id];
                if (pc.getSenders) {
                    const videoSender = pc.getSenders().find((s) => (s.track ? s.track.kind === 'video' : s.kind === 'video'));
                    if (videoSender) {
                        videoSender.replaceTrack(null).catch((err) => console.error('[WebRTC] Error clearing video track:', err));
                    }
                }
            }
            if (localVideoref.current) {
                localVideoref.current.srcObject = null;
            }
            broadcastMediaState(false, audio, false);
        }
    }, [video, audio, broadcastMediaState]);

    // Handle incoming WebRTC signaling message
    const gotMessageFromServer = useCallback((fromId, messageStr) => {
        try {
            const signal = JSON.parse(messageStr);
            if (fromId === socketIdRef.current) return;

            // Update peer display name
            if (signal.userName) {
                peerNamesRef.current[fromId] = signal.userName;
                setVideos((prevVideos) =>
                    prevVideos.map((v) => (v.socketId === fromId ? { ...v, userName: signal.userName } : v))
                );
            }

            // Update peer media toggle states (camera on/off, mic on/off, screen share)
            if (signal.type === 'media-toggle') {
                console.log(`[WebRTC] media-toggle from ${fromId}: video=${signal.isVideoOn}, audio=${signal.isAudioOn}`);
                peerMediaStatesRef.current[fromId] = {
                    isVideoOn: signal.isVideoOn,
                    isAudioOn: signal.isAudioOn,
                    isScreenSharing: signal.isScreenSharing
                };

                setVideos((prevVideos) =>
                    prevVideos.map((v) => {
                        if (v.socketId === fromId) {
                            return {
                                ...v,
                                isVideoOn: signal.isVideoOn !== undefined ? signal.isVideoOn : v.isVideoOn,
                                isAudioOn: signal.isAudioOn !== undefined ? signal.isAudioOn : v.isAudioOn,
                                isScreenSharing: signal.isScreenSharing !== undefined ? signal.isScreenSharing : v.isScreenSharing,
                                userName: signal.userName || v.userName
                            };
                        }
                        return v;
                    })
                );
            }

            // ICE Candidate handling: Temporarily queue candidates until remote description exists, then add them
            if (signal.ice) {
                const pc = connectionsRef.current[fromId];
                if (!pc || !pc.remoteDescription || !pc.remoteDescription.type) {
                    console.log(`[WebRTC] Queuing ICE candidate from ${fromId} (remoteDescription not set)`);
                    if (!iceCandidateQueueRef.current[fromId]) {
                        iceCandidateQueueRef.current[fromId] = [];
                    }
                    iceCandidateQueueRef.current[fromId].push(signal.ice);
                } else {
                    pc.addIceCandidate(new RTCIceCandidate(signal.ice))
                        .then(() => console.log(`[WebRTC] Successfully added ICE candidate from ${fromId}`))
                        .catch((e) => {
                            console.error(`[WebRTC] Error adding ICE candidate from ${fromId}:`, e);
                            if (!iceCandidateQueueRef.current[fromId]) {
                                iceCandidateQueueRef.current[fromId] = [];
                            }
                            iceCandidateQueueRef.current[fromId].push(signal.ice);
                        });
                }
            }

            const pc = connectionsRef.current[fromId];
            if (!pc) return;

            // SDP handling
            if (signal.sdp) {
                if (signal.sdp.type === 'offer') {
                    console.log('[WebRTC] Received offer from ' + fromId);
                } else if (signal.sdp.type === 'answer') {
                    console.log('[WebRTC] Received answer from ' + fromId);
                }

                pc.setRemoteDescription(new RTCSessionDescription(signal.sdp))
                    .then(() => {
                        // Remote description exists: flush queued ICE candidates
                        if (iceCandidateQueueRef.current[fromId] && iceCandidateQueueRef.current[fromId].length > 0) {
                            const queuedCandidates = iceCandidateQueueRef.current[fromId];
                            iceCandidateQueueRef.current[fromId] = [];
                            console.log(`[WebRTC] Flushing ${queuedCandidates.length} queued ICE candidates for ${fromId}`);
                            queuedCandidates.forEach((candidate) => {
                                pc.addIceCandidate(new RTCIceCandidate(candidate))
                                    .then(() => console.log(`[WebRTC] Added queued ICE candidate for ${fromId}`))
                                    .catch((e) => console.error(`[WebRTC] Error adding queued ICE candidate for ${fromId}:`, e));
                            });
                        }

                        if (signal.sdp.type === 'offer') {
                            pc.createAnswer()
                                .then((description) => {
                                    return pc.setLocalDescription(description).then(() => {
                                        if (socketRef.current) {
                                            console.log('[WebRTC] Sending answer to ' + fromId);
                                            socketRef.current.emit(
                                                'signal',
                                                fromId,
                                                JSON.stringify({
                                                    sdp: pc.localDescription,
                                                    userName: usernameRef.current || username || 'Participant',
                                                    type: 'media-toggle',
                                                    isVideoOn: video || screen,
                                                    isAudioOn: audio,
                                                    isScreenSharing: screen
                                                })
                                            );
                                        }
                                    });
                                })
                                .catch((e) => console.error(`[WebRTC] Error creating answer for ${fromId}:`, e));
                        }
                    })
                    .catch((e) => console.error(`[WebRTC] Error setting remote description for ${fromId}:`, e));
            }
        } catch (err) {
            console.error('[WebRTC] Error handling message from server:', err);
        }
    }, [video, audio, screen, username]);

    // Connect to Socket.IO and establish WebRTC peers
    const connectToSocketServer = useCallback(() => {
        if (socketRef.current) return;
        const targetRoom = (meetingCodeRef.current || meetingCode || '').trim();
        if (!targetRoom) return;

        console.log(`[WebRTC] Connecting to socket server: ${server_url} for canonical room: ${targetRoom}`);
        socketRef.current = io.connect(server_url, { secure: false });

        socketRef.current.on('signal', gotMessageFromServer);

        socketRef.current.on('connect', () => {
            const currentDisplayName = usernameRef.current || username || 'Participant';
            console.log(`[WebRTC] Socket connected. ID: ${socketRef.current.id}. Joining canonical call: ${targetRoom} as "${currentDisplayName}"`);
            socketIdRef.current = socketRef.current.id;

            socketRef.current.emit('join-call', targetRoom, currentDisplayName);

            socketRef.current.on('chat-message', addMessage);

            // Server room-joined confirmation
            socketRef.current.on('room-joined', (data) => {
                console.log(`[WebRTC] Confirmed room membership for room: ${data.roomId}`, data);
                if (data.participants && Array.isArray(data.participants)) {
                    setParticipants(data.participants);
                }
            });

            // Authoritative participant synchronization
            socketRef.current.on('participants-update', (updatedList) => {
                console.log('[WebRTC] participants-update received:', updatedList);
                if (!Array.isArray(updatedList)) return;
                setParticipants(updatedList);

                // Keep peer names ref updated
                updatedList.forEach((p) => {
                    if (p.socketId && p.username) {
                        peerNamesRef.current[p.socketId] = p.username;
                    }
                });

                // Synchronize remote participant tiles in videos state
                const remoteList = updatedList.filter((p) => p.socketId !== socketIdRef.current);

                setVideos((prevVideos) => {
                    const nextVideos = [...prevVideos];

                    // 1. Add any remote participant not yet in nextVideos
                    remoteList.forEach((p) => {
                        const existingIndex = nextVideos.findIndex((v) => v.socketId === p.socketId);
                        if (existingIndex === -1) {
                            nextVideos.push({
                                socketId: p.socketId,
                                userName: p.username || 'Participant',
                                stream: remoteStreamsRef.current[p.socketId] || null,
                                isVideoOn: peerMediaStatesRef.current[p.socketId]?.isVideoOn || false,
                                isAudioOn: peerMediaStatesRef.current[p.socketId]?.isAudioOn || false,
                                isScreenSharing: peerMediaStatesRef.current[p.socketId]?.isScreenSharing || false
                            });
                        } else {
                            if (p.username && nextVideos[existingIndex].userName !== p.username) {
                                nextVideos[existingIndex] = {
                                    ...nextVideos[existingIndex],
                                    userName: p.username
                                };
                            }
                        }
                    });

                    // 2. Remove participants who are no longer in remoteList
                    return nextVideos.filter((v) => remoteList.some((p) => p.socketId === v.socketId));
                });
            });

            // Real-time guest access changes broadcast from host
            socketRef.current.on('guest-access-updated', (newAllowGuests) => {
                console.log(`[WebRTC] Guest access updated broadcast: ${newAllowGuests}`);
                setAllowGuests(newAllowGuests);
                if (!isHost) {
                    if (!newAllowGuests) {
                        setIsGuestBlocked(true);
                    } else {
                        setIsGuestBlocked(false);
                        setToast({ open: true, message: 'Host has enabled guest access.', severity: 'success' });
                    }
                }
            });

            // Participant leaves
            socketRef.current.on('user-left', (id) => {
                console.log(`[WebRTC] User left: ${id}`);
                const leavingName = peerNamesRef.current[id] || 'A participant';
                setToast({ open: true, message: `${leavingName} left the meeting`, severity: 'info' });

                setVideos((prev) => prev.filter((v) => v.socketId !== id));
                setParticipants((prev) => prev.filter((p) => p.socketId !== id));

                if (connectionsRef.current[id]) {
                    try {
                        connectionsRef.current[id].close();
                    } catch (e) {
                        console.error(`[WebRTC] Error closing peer connection for ${id}:`, e);
                    }
                    delete connectionsRef.current[id];
                }
                if (remoteStreamsRef.current[id]) {
                    try {
                        remoteStreamsRef.current[id].getTracks().forEach((t) => t.stop());
                    } catch (e) {}
                    delete remoteStreamsRef.current[id];
                }
                delete remoteVideoRefs.current[id];
                delete peerNamesRef.current[id];
                delete peerMediaStatesRef.current[id];
                delete iceCandidateQueueRef.current[id];
            });

            // Participant joins
            socketRef.current.on('user-joined', (id, clients, serverParticipants) => {
                console.log(`[WebRTC] user-joined event: joiningId=${id}, allClients=`, clients);

                // Show toast notification when someone else joins
                if (id !== socketIdRef.current) {
                    const joiningUser = (serverParticipants || []).find((p) => p.socketId === id);
                    const nameToShow = joiningUser?.username || peerNamesRef.current[id] || 'A participant';
                    setToast({ open: true, message: `${nameToShow} joined the meeting`, severity: 'info' });
                }

                // If server provided updated participants, sync state
                if (serverParticipants && Array.isArray(serverParticipants)) {
                    setParticipants(serverParticipants);
                }

                clients.forEach((socketListId) => {
                    if (socketListId === socketIdRef.current) return;

                    // Ensure remote participant tile exists in videos state immediately
                    setVideos((prevVideos) => {
                        const exists = prevVideos.some((v) => v.socketId === socketListId);
                        if (!exists) {
                            const foundParticipant = (serverParticipants || []).find((p) => p.socketId === socketListId);
                            const pName = foundParticipant?.username || peerNamesRef.current[socketListId] || 'Participant';
                            return [
                                ...prevVideos,
                                {
                                    socketId: socketListId,
                                    userName: pName,
                                    stream: remoteStreamsRef.current[socketListId] || null,
                                    isVideoOn: peerMediaStatesRef.current[socketListId]?.isVideoOn || false,
                                    isAudioOn: peerMediaStatesRef.current[socketListId]?.isAudioOn || false,
                                    isScreenSharing: peerMediaStatesRef.current[socketListId]?.isScreenSharing || false
                                }
                            ];
                        }
                        return prevVideos;
                    });

                    // Create RTCPeerConnection if not already created
                    if (!connectionsRef.current[socketListId]) {
                        console.log('[WebRTC] Creating peer connection for ' + socketListId);
                        const pc = new RTCPeerConnection(peerConfigConnections);
                        connectionsRef.current[socketListId] = pc;

                        pc.onicecandidate = (event) => {
                            if (event.candidate && socketRef.current) {
                                socketRef.current.emit('signal', socketListId, JSON.stringify({ ice: event.candidate }));
                            }
                        };

                        // Add transceivers upfront so media sections exist in SDP even if camera/mic are off initially
                        try {
                            pc.addTransceiver('video', { direction: 'sendrecv' });
                            pc.addTransceiver('audio', { direction: 'sendrecv' });
                        } catch (e) {
                            console.warn('[WebRTC] addTransceiver note:', e);
                        }

                        // Share our name and media status with peer
                        if (socketRef.current) {
                            socketRef.current.emit(
                                'signal',
                                socketListId,
                                JSON.stringify({
                                    userName: usernameRef.current || username || 'Participant',
                                    type: 'media-toggle',
                                    isVideoOn: video || screen,
                                    isAudioOn: audio,
                                    isScreenSharing: screen
                                })
                            );
                        }

                        // Attach local tracks if any exist
                        if (localStreamRef.current) {
                            console.log('[WebRTC] Adding local tracks to ' + socketListId);
                            localStreamRef.current.getTracks().forEach((track) => {
                                const sender = pc.getSenders().find((s) => (s.track ? s.track.kind === track.kind : s.kind === track.kind));
                                if (sender) {
                                    sender.replaceTrack(track).catch(() => {});
                                } else {
                                    pc.addTrack(track, localStreamRef.current);
                                }
                            });
                        }
                        if (screenStreamRef.current) {
                            console.log('[WebRTC] Adding local tracks (screen) to ' + socketListId);
                            screenStreamRef.current.getTracks().forEach((track) => {
                                const sender = pc.getSenders().find((s) => (s.track ? s.track.kind === track.kind : s.kind === track.kind));
                                if (sender) {
                                    sender.replaceTrack(track).catch(() => {});
                                } else {
                                    pc.addTrack(track, screenStreamRef.current);
                                }
                            });
                        }

                        // Track received via modern ontrack
                        pc.ontrack = (event) => {
                            console.log('[WebRTC] Remote track received from ' + socketListId + ' (' + event.track.kind + ')');
                            if (!remoteStreamsRef.current[socketListId]) {
                                remoteStreamsRef.current[socketListId] = new MediaStream();
                            }
                            const peerStream = remoteStreamsRef.current[socketListId];

                            const existingTracks = peerStream.getTracks();
                            if (!existingTracks.some((t) => t.id === event.track.id)) {
                                peerStream.addTrack(event.track);
                            }

                            if (remoteVideoRefs.current[socketListId]) {
                                const videoEl = remoteVideoRefs.current[socketListId];
                                if (videoEl.srcObject !== peerStream) {
                                    videoEl.srcObject = peerStream;
                                    console.log('[WebRTC] Remote stream attached for ' + socketListId);
                                }
                                videoEl.play().catch((err) => console.warn(`[WebRTC] Autoplay note for ${socketListId}:`, err));
                            }

                            setVideos((prevVideos) =>
                                prevVideos.map((v) =>
                                    v.socketId === socketListId
                                        ? {
                                              ...v,
                                              stream: peerStream,
                                              userName: v.userName || peerNamesRef.current[socketListId] || 'Participant',
                                              isVideoOn: event.track.kind === 'video' ? true : v.isVideoOn
                                          }
                                        : v
                                )
                            );
                        };

                        // Fallback onaddstream
                        pc.onaddstream = (event) => {
                            console.log('[WebRTC] onaddstream from ' + socketListId);
                            remoteStreamsRef.current[socketListId] = event.stream;
                            if (remoteVideoRefs.current[socketListId]) {
                                remoteVideoRefs.current[socketListId].srcObject = event.stream;
                                remoteVideoRefs.current[socketListId].play().catch(() => {});
                            }
                            setVideos((prevVideos) =>
                                prevVideos.map((v) =>
                                    v.socketId === socketListId
                                        ? {
                                              ...v,
                                              stream: event.stream,
                                              userName: v.userName || peerNamesRef.current[socketListId] || 'Participant'
                                          }
                                        : v
                                )
                            );
                        };
                    }
                });

                // If this is the newly joined user, create offer to existing peers
                if (id === socketIdRef.current) {
                    for (let id2 in connectionsRef.current) {
                        if (id2 === socketIdRef.current) continue;
                        const peer = connectionsRef.current[id2];
                        peer.createOffer()
                            .then((description) => {
                                return peer.setLocalDescription(description).then(() => {
                                    if (socketRef.current) {
                                        console.log('[WebRTC] Sending offer to ' + id2);
                                        socketRef.current.emit(
                                            'signal',
                                            id2,
                                            JSON.stringify({
                                                sdp: peer.localDescription,
                                                userName: usernameRef.current || username || 'Participant',
                                                type: 'media-toggle',
                                                isVideoOn: video || screen,
                                                isAudioOn: audio,
                                                isScreenSharing: screen
                                            })
                                        );
                                    }
                                });
                            })
                            .catch((e) => console.error(`[WebRTC] Error creating offer for ${id2}:`, e));
                    }
                }
            });
        });
    }, [addMessage, gotMessageFromServer, meetingCode, isHost, video, audio, screen, username]);

    // Connect automatically when meeting is validated and user is ready
    useEffect(() => {
        if (!meetingLoading && !meetingNotFound && !askForUsername && !isGuestBlocked) {
            connectToSocketServer();
        }
    }, [meetingLoading, meetingNotFound, askForUsername, isGuestBlocked, connectToSocketServer]);

    // Cleanup all media tracks, sockets, and connections on unmount
    useEffect(() => {
        const localVideoEl = localVideoref.current;
        return () => {
            console.log('[WebRTC] Component unmounting: Cleaning up all tracks and connections');
            if (localStreamRef.current) {
                localStreamRef.current.getTracks().forEach((track) => {
                    try { track.stop(); } catch (e) {}
                });
                localStreamRef.current = null;
            }

            if (screenStreamRef.current) {
                screenStreamRef.current.getTracks().forEach((track) => {
                    try { track.stop(); } catch (e) {}
                });
                screenStreamRef.current = null;
            }

            if (localVideoEl && localVideoEl.srcObject) {
                try {
                    localVideoEl.srcObject.getTracks().forEach((t) => t.stop());
                    localVideoEl.srcObject = null;
                } catch (e) {}
            }

            for (let id in connectionsRef.current) {
                try {
                    connectionsRef.current[id].close();
                } catch (e) {}
            }
            connectionsRef.current = {};
            remoteStreamsRef.current = {};
            remoteVideoRefs.current = {};

            if (socketRef.current) {
                try {
                    socketRef.current.emit('leave-call');
                    socketRef.current.disconnect();
                } catch (e) {}
                socketRef.current = null;
            }
        };
    }, []);

    // TOGGLE CAMERA
    const handleToggleVideo = async () => {
        if (video) {
            // Turning camera OFF
            setVideo(false);

            if (localStreamRef.current) {
                localStreamRef.current.getVideoTracks().forEach((track) => {
                    try { track.stop(); } catch (e) {}
                    localStreamRef.current.removeTrack(track);
                });
            }

            if (localVideoref.current && localVideoref.current.srcObject && !screen) {
                try {
                    localVideoref.current.srcObject.getVideoTracks().forEach((t) => t.stop());
                    localVideoref.current.srcObject = null;
                } catch (e) {}
            }

            if (!screen) {
                for (let id in connectionsRef.current) {
                    const pc = connectionsRef.current[id];
                    if (pc.getSenders) {
                        const videoSender = pc.getSenders().find((s) => (s.track ? s.track.kind === 'video' : s.kind === 'video'));
                        if (videoSender) {
                            videoSender.replaceTrack(null).catch((err) => console.error('[WebRTC] Error removing video track:', err));
                        }
                    }
                }
            }

            broadcastMediaState(false, audio, screen);
        } else {
            // Turning camera ON
            try {
                const newStream = await navigator.mediaDevices.getUserMedia({
                    video: { width: { ideal: 640 }, height: { ideal: 480 } }
                });

                const newVideoTrack = newStream.getVideoTracks()[0];

                if (!localStreamRef.current) {
                    localStreamRef.current = new MediaStream();
                }
                localStreamRef.current.addTrack(newVideoTrack);

                if (localVideoref.current && !screen) {
                    localVideoref.current.srcObject = localStreamRef.current;
                }

                setVideo(true);

                if (!screen) {
                    for (let id in connectionsRef.current) {
                        const pc = connectionsRef.current[id];
                        if (pc.getSenders) {
                            const videoSender = pc.getSenders().find((s) => (s.track ? s.track.kind === 'video' : s.kind === 'video'));
                            if (videoSender) {
                                videoSender.replaceTrack(newVideoTrack).catch((err) => console.error('[WebRTC] Error replacing video track:', err));
                            } else if (pc.addTrack) {
                                pc.addTrack(newVideoTrack, localStreamRef.current);
                            }
                        } else if (pc.addTrack) {
                            pc.addTrack(newVideoTrack, localStreamRef.current);
                        }
                    }
                }

                broadcastMediaState(true, audio, screen);
            } catch (err) {
                console.error('[WebRTC] Camera access error:', err);
                setToast({ open: true, message: 'Could not access camera. Please check permissions.', severity: 'error' });
                setVideo(false);
            }
        }
    };

    // TOGGLE MICROPHONE
    const handleToggleAudio = async () => {
        if (audio) {
            setAudio(false);

            if (localStreamRef.current) {
                localStreamRef.current.getAudioTracks().forEach((track) => {
                    try { track.stop(); } catch (e) {}
                    localStreamRef.current.removeTrack(track);
                });
            }

            for (let id in connectionsRef.current) {
                const pc = connectionsRef.current[id];
                if (pc.getSenders) {
                    const audioSender = pc.getSenders().find((s) => (s.track ? s.track.kind === 'audio' : s.kind === 'audio'));
                    if (audioSender) {
                        audioSender.replaceTrack(null).catch((err) => console.error('[WebRTC] Error muting audio track:', err));
                    }
                }
            }

            broadcastMediaState(video || screen, false, screen);
        } else {
            try {
                const newStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                const newAudioTrack = newStream.getAudioTracks()[0];

                if (!localStreamRef.current) {
                    localStreamRef.current = new MediaStream();
                }
                localStreamRef.current.addTrack(newAudioTrack);

                setAudio(true);

                for (let id in connectionsRef.current) {
                    const pc = connectionsRef.current[id];
                    if (pc.getSenders) {
                        const audioSender = pc.getSenders().find((s) => (s.track ? s.track.kind === 'audio' : s.kind === 'audio'));
                        if (audioSender) {
                            audioSender.replaceTrack(newAudioTrack).catch((err) => console.error('[WebRTC] Error unmuting audio track:', err));
                        } else if (pc.addTrack) {
                            pc.addTrack(newAudioTrack, localStreamRef.current);
                        }
                    } else if (pc.addTrack) {
                        pc.addTrack(newAudioTrack, localStreamRef.current);
                    }
                }

                broadcastMediaState(video || screen, true, screen);
            } catch (err) {
                console.error('[WebRTC] Mic access error:', err);
                setToast({ open: true, message: 'Could not access microphone. Please check permissions.', severity: 'error' });
                setAudio(false);
            }
        }
    };

    // TOGGLE SCREEN SHARE
    const handleToggleScreen = async () => {
        if (screen) {
            stopScreenShare();
        } else {
            try {
                if (!navigator.mediaDevices?.getDisplayMedia) return;
                const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
                const screenTrack = screenStream.getVideoTracks()[0];

                screenStreamRef.current = screenStream;
                setScreen(true);

                screenTrack.onended = () => {
                    stopScreenShare();
                };

                for (let id in connectionsRef.current) {
                    const pc = connectionsRef.current[id];
                    if (pc.getSenders) {
                        const videoSender = pc.getSenders().find((s) => (s.track ? s.track.kind === 'video' : s.kind === 'video'));
                        if (videoSender) {
                            videoSender.replaceTrack(screenTrack).catch((err) => console.error('[WebRTC] Error setting screen track:', err));
                        } else if (pc.addTrack) {
                            pc.addTrack(screenTrack, screenStream);
                        }
                    } else if (pc.addTrack) {
                        pc.addTrack(screenTrack, screenStream);
                    }
                }

                if (localVideoref.current) {
                    localVideoref.current.srcObject = screenStream;
                }

                broadcastMediaState(true, audio, true);
            } catch (err) {
                console.error('[WebRTC] Screen sharing error:', err);
                setScreen(false);
            }
        }
    };

    // End call / Leave meeting
    const handleEndCall = () => {
        console.log('[WebRTC] End call invoked: Stopping all tracks and closing connections');
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach((track) => {
                try { track.stop(); } catch (e) {}
            });
            localStreamRef.current = null;
        }

        if (screenStreamRef.current) {
            screenStreamRef.current.getTracks().forEach((track) => {
                try { track.stop(); } catch (e) {}
            });
            screenStreamRef.current = null;
        }

        if (localVideoref.current && localVideoref.current.srcObject) {
            try {
                localVideoref.current.srcObject.getTracks().forEach((t) => t.stop());
                localVideoref.current.srcObject = null;
            } catch (e) {}
        }

        for (let id in connectionsRef.current) {
            try {
                connectionsRef.current[id].close();
            } catch (e) {}
        }
        connectionsRef.current = {};
        remoteStreamsRef.current = {};
        remoteVideoRefs.current = {};

        if (socketRef.current) {
            try {
                socketRef.current.emit('leave-call');
                socketRef.current.disconnect();
            } catch (e) {}
            socketRef.current = null;
        }

        navigate('/');
    };

    // Send chat message
    const sendMessage = () => {
        if (!message.trim() || !socketRef.current) return;
        socketRef.current.emit('chat-message', message.trim(), usernameRef.current || username || 'Participant');
        setMessage('');
    };

    // Host Access Control: Toggle "Allow guests to join"
    const handleToggleGuestAccess = async (event) => {
        const newSetting = event.target.checked;
        setHostUpdating(true);
        try {
            const token = localStorage.getItem('token');
            const targetCode = meetingCodeRef.current || meetingCode;
            const res = await axios.post(`${server_url}/api/v1/users/meeting/allow_guests`, {
                token,
                meetingCode: targetCode,
                allowGuests: newSetting
            });

            if (res.data) {
                setAllowGuests(newSetting);
                if (socketRef.current) {
                    socketRef.current.emit('change-guest-access', targetCode, newSetting);
                }
                setToast({
                    open: true,
                    message: newSetting ? 'Guest access enabled: Guests can now join.' : 'Guest access disabled: Guests will be blocked from joining.',
                    severity: 'info'
                });
            }
        } catch (err) {
            console.error('[WebRTC] Error updating guest access:', err);
            setToast({ open: true, message: 'Failed to update guest access setting.', severity: 'error' });
        } finally {
            setHostUpdating(false);
        }
    };

    // Copy meeting code
    const handleCopyMeetingLink = async () => {
        const link = `${window.location.origin}/${meetingCode}`;
        try {
            await navigator.clipboard.writeText(link);
            setToast({ open: true, message: 'Meeting link copied to clipboard!', severity: 'success' });
        } catch (e) {
            setToast({ open: true, message: `Meeting code: ${meetingCode}`, severity: 'info' });
        }
    };

    // Connect from Lobby
    const handleLobbyConnect = () => {
        if (!username.trim()) return;
        usernameRef.current = username.trim();
        setAskForUsername(false);
    };

    // Calculate authoritative total participant count
    const totalParticipants = participants.length > 0 ? participants.length : (1 + videos.length);

    let gridClass = styles.gridCount1;
    if (totalParticipants === 2) gridClass = styles.gridCount2;
    else if (totalParticipants === 3) gridClass = styles.gridCount3;
    else if (totalParticipants === 4) gridClass = styles.gridCount4;
    else if (totalParticipants === 5 || totalParticipants === 6) gridClass = styles.gridCount5;
    else if (totalParticipants > 6) gridClass = styles.gridCountMore;

    // Render Loading State
    if (meetingLoading) {
        return (
            <Box sx={{ minHeight: '100vh', bgcolor: '#202124', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                <CircularProgress color="primary" size={48} sx={{ mb: 2 }} />
                <Typography variant="h6" sx={{ fontWeight: 500 }}>
                    Connecting to ConnectX meeting...
                </Typography>
            </Box>
        );
    }

    // Render Meeting Not Found
    if (meetingNotFound) {
        return (
            <Box sx={{ minHeight: '100vh', bgcolor: '#202124', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', p: 3, textAlign: 'center', color: '#fff' }}>
                <Card elevation={4} sx={{ maxWidth: 460, bgcolor: '#2d2e30', color: '#fff', borderRadius: 3, p: 3 }}>
                    <CardContent sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <LockPersonIcon sx={{ fontSize: 56, color: '#ea4335', mb: 2 }} />
                        <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>
                            Meeting Not Found
                        </Typography>
                        <Typography variant="body2" sx={{ color: '#9aa0a6', mb: 3 }}>
                            The meeting code <b>{meetingCode || rawMeetingCode}</b> doesn't match any active meeting. Please verify the code and try again.
                        </Typography>
                        <Button variant="contained" onClick={() => navigate('/')} sx={{ borderRadius: 2, textTransform: 'none', px: 4, bgcolor: '#1a73e8' }}>
                            Back to Home
                        </Button>
                    </CardContent>
                </Card>
            </Box>
        );
    }

    // Render Guest Blocked / Waiting Screen
    if (isGuestBlocked) {
        return (
            <div className={styles.waitingContainer}>
                <div className={styles.waitingCard}>
                    <div className={styles.waitingIconWrapper}>
                        <HourglassEmptyIcon sx={{ fontSize: 44 }} />
                    </div>
                    <Typography variant="h5" sx={{ fontWeight: 700, mb: 1.5, color: '#ffffff' }}>
                        Waiting for host to allow guests
                    </Typography>
                    <Typography variant="body1" sx={{ color: '#9aa0a6', mb: 3.5, lineHeight: 1.5 }}>
                        Guest access is currently restricted by the host. Please wait while the host admits guests into this meeting.
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3.5 }}>
                        <CircularProgress size={24} sx={{ color: '#8ab4f8' }} />
                        <Typography variant="body2" sx={{ color: '#8ab4f8', fontWeight: 500 }}>
                            Waiting to enter {meetingCode}...
                        </Typography>
                    </Box>
                    <Button variant="outlined" onClick={() => navigate('/')} sx={{ color: '#dadce0', borderColor: '#5f6368', borderRadius: 2, textTransform: 'none', px: 3 }}>
                        Leave Waiting Room
                    </Button>
                </div>
            </div>
        );
    }

    // Render Lobby Connect Card if display name is needed
    if (askForUsername) {
        return (
            <Box sx={{ minHeight: '100vh', bgcolor: '#202124', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', p: 2 }}>
                <Card elevation={4} sx={{ maxWidth: 420, width: '100%', borderRadius: 3, p: 2, bgcolor: '#2d2e30', color: '#ffffff', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <CardContent sx={{ textAlign: 'center' }}>
                        <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>
                            Ready to join?
                        </Typography>
                        <Typography variant="body2" sx={{ color: '#9aa0a6', mb: 3 }}>
                            Enter your display name to join meeting <b>{meetingCode}</b>
                        </Typography>
                        <TextField
                            fullWidth
                            label="Your Name"
                            placeholder="Enter your name"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleLobbyConnect();
                            }}
                            variant="outlined"
                            autoFocus
                            sx={{
                                mb: 3,
                                '& .MuiOutlinedInput-root': {
                                    color: '#ffffff',
                                    '& fieldset': { borderColor: '#5f6368' },
                                    '&:hover fieldset': { borderColor: '#8ab4f8' },
                                    '&.Mui-focused fieldset': { borderColor: '#1a73e8' }
                                },
                                '& .MuiInputLabel-root': { color: '#9aa0a6' }
                            }}
                        />
                        <Button
                            variant="contained"
                            fullWidth
                            size="large"
                            onClick={handleLobbyConnect}
                            disabled={!username.trim()}
                            sx={{
                                py: 1.3,
                                borderRadius: 2.5,
                                fontWeight: 700,
                                textTransform: 'none',
                                bgcolor: '#1a73e8',
                                '&:hover': { bgcolor: '#1557b0' }
                            }}
                        >
                            Join Meeting
                        </Button>
                    </CardContent>
                </Card>
            </Box>
        );
    }

    // Render ACTIVE MEETING UI (Google-Meet-Inspired Shared Room)
    return (
        <div className={styles.meetVideoContainer}>
            {/* Top Meeting Bar */}
            <div className={styles.topMeetingBar}>
                <div className={styles.topBarLeft}>
                    <div className={styles.meetingCodeChip}>
                        <span>{meetingCode}</span>
                        <Tooltip title="Copy meeting link">
                            <IconButton size="small" onClick={handleCopyMeetingLink} sx={{ color: '#e8eaed', p: 0.5 }}>
                                <ContentCopyIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                        </Tooltip>
                    </div>

                    <div className={styles.participantCountChip}>
                        <PeopleAltIcon sx={{ fontSize: 18, color: '#8ab4f8' }} />
                        <span>{totalParticipants}</span>
                    </div>
                </div>

                <div className={styles.topBarRight}>
                    {/* Host Control: Allow guests to join */}
                    {isHost && (
                        <div className={styles.hostControlBox}>
                            <span className={styles.hostBadge}>Host</span>
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={allowGuests}
                                        onChange={handleToggleGuestAccess}
                                        disabled={hostUpdating}
                                        color="primary"
                                        size="small"
                                    />
                                }
                                label={
                                    <Typography variant="body2" sx={{ fontSize: '0.82rem', fontWeight: 600, color: '#e8eaed' }}>
                                        Allow guests to join
                                    </Typography>
                                }
                                sx={{ m: 0 }}
                            />
                        </div>
                    )}
                </div>
            </div>

            {/* Main Video Area: Responsive Square/Rounded Grid of Participant Tiles */}
            <div className={styles.mainStage}>
                <div className={`${styles.videoGrid} ${gridClass}`}>
                    {/* LOCAL PARTICIPANT TILE (You) */}
                    <div className={`${styles.participantTile} ${styles.participantTileActive}`}>
                        <video
                            ref={localVideoref}
                            autoPlay
                            muted
                            playsInline
                            className={`${styles.tileVideo} ${styles.tileVideoMirrored}`}
                            style={{ display: (video || screen) ? 'block' : 'none' }}
                        />

                        {!(video || screen) && (
                            <div className={styles.avatarTileContainer}>
                                <div className={styles.avatarCircle} style={{ backgroundColor: getAvatarColor(username || 'You') }}>
                                    {getInitials(username || 'You')}
                                </div>
                                <div className={styles.avatarNameLabel}>{username || 'You'}</div>
                                <div className={styles.avatarCameraOffSubtext}>
                                    <VideocamOffIcon sx={{ fontSize: 14 }} /> Camera is off
                                </div>
                            </div>
                        )}

                        {/* Local Participant Name Overlay */}
                        <div className={styles.tileNameTag}>
                            <span>{username || 'You'} (You)</span>
                        </div>

                        {/* Local Audio Indicator */}
                        <div className={`${styles.tileAudioIndicator} ${audio ? styles.tileAudioActive : styles.tileAudioMuted}`}>
                            {audio ? <MicIcon sx={{ fontSize: 16 }} /> : <MicOffIcon sx={{ fontSize: 16 }} />}
                        </div>
                    </div>

                    {/* REMOTE PARTICIPANTS TILES */}
                    {videos.map((peer) => {
                        const hasLiveVideo = Boolean(
                            peer.isVideoOn &&
                            peer.stream &&
                            peer.stream.getVideoTracks().some((t) => t.enabled && t.readyState === 'live')
                        );

                        return (
                            <div key={peer.socketId} className={styles.participantTile}>
                                <video
                                    data-socket={peer.socketId}
                                    ref={(ref) => {
                                        if (ref) {
                                            remoteVideoRefs.current[peer.socketId] = ref;
                                            const stream = peer.stream || remoteStreamsRef.current[peer.socketId];
                                            if (stream && ref.srcObject !== stream) {
                                                ref.srcObject = stream;
                                            }
                                            ref.play().catch(() => {});
                                        }
                                    }}
                                    autoPlay
                                    playsInline
                                    className={styles.tileVideo}
                                    style={{ display: hasLiveVideo ? 'block' : 'none' }}
                                />

                                {!hasLiveVideo && (
                                    <div className={styles.avatarTileContainer}>
                                        <div className={styles.avatarCircle} style={{ backgroundColor: getAvatarColor(peer.userName || 'Participant') }}>
                                            {getInitials(peer.userName || 'Participant')}
                                        </div>
                                        <div className={styles.avatarNameLabel}>{peer.userName || 'Participant'}</div>
                                        <div className={styles.avatarCameraOffSubtext}>
                                            <VideocamOffIcon sx={{ fontSize: 14 }} /> Camera is off
                                        </div>
                                    </div>
                                )}

                                {/* Remote Participant Name Tag */}
                                <div className={styles.tileNameTag}>
                                    <span>{peer.userName || 'Participant'}</span>
                                </div>

                                {/* Remote Audio Indicator */}
                                <div className={`${styles.tileAudioIndicator} ${peer.isAudioOn ? styles.tileAudioActive : styles.tileAudioMuted}`}>
                                    {peer.isAudioOn ? <MicIcon sx={{ fontSize: 16 }} /> : <MicOffIcon sx={{ fontSize: 16 }} />}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Bottom Meeting Controls Bar */}
            <div className={styles.bottomControlBar}>
                {/* Left: Meeting Time and Code */}
                <div className={styles.bottomControlLeft}>
                    <span className={styles.meetingTime}>{currentTime}</span>
                    <span className={styles.meetingCodeText}>| {meetingCode}</span>
                </div>

                {/* Center: Device Controls (Mic, Cam, Screen, Leave) */}
                <div className={styles.bottomControlCenter}>
                    {/* Microphone Button */}
                    <Tooltip title={audio ? 'Turn off microphone' : 'Turn on microphone'}>
                        <button
                            type="button"
                            className={`${styles.controlButton} ${!audio ? styles.controlButtonOff : ''}`}
                            onClick={handleToggleAudio}
                        >
                            {audio ? <MicIcon /> : <MicOffIcon />}
                        </button>
                    </Tooltip>

                    {/* Camera Button */}
                    <Tooltip title={video ? 'Turn off camera' : 'Turn on camera'}>
                        <button
                            type="button"
                            className={`${styles.controlButton} ${!video ? styles.controlButtonOff : ''}`}
                            onClick={handleToggleVideo}
                        >
                            {video ? <VideocamIcon /> : <VideocamOffIcon />}
                        </button>
                    </Tooltip>

                    {/* Screen Share Button */}
                    {screenAvailable && (
                        <Tooltip title={screen ? 'Stop presenting' : 'Present now'}>
                            <button
                                type="button"
                                className={`${styles.controlButton} ${screen ? styles.controlButtonActive : ''}`}
                                onClick={handleToggleScreen}
                            >
                                {screen ? <StopScreenShareIcon /> : <ScreenShareIcon />}
                            </button>
                        </Tooltip>
                    )}

                    {/* Leave / End Call Button */}
                    <Tooltip title="Leave call">
                        <button
                            type="button"
                            className={styles.endCallButton}
                            onClick={handleEndCall}
                        >
                            <CallEndIcon />
                        </button>
                    </Tooltip>
                </div>

                {/* Right: Chat Button & Action Controls */}
                <div className={styles.bottomControlRight}>
                    {/* Chat Button with unread counter */}
                    <Tooltip title="In-call messages">
                        <Badge badgeContent={newMessages} color="primary" max={99}>
                            <button
                                type="button"
                                className={`${styles.rightActionButton} ${showChat ? styles.rightActionButtonActive : ''}`}
                                onClick={() => {
                                    setShowChat(!showChat);
                                    setNewMessages(0);
                                }}
                            >
                                <ChatIcon />
                            </button>
                        </Badge>
                    </Tooltip>
                </div>
            </div>

            {/* Google-Meet-Style In-Call Chat Panel */}
            {showChat && (
                <div className={styles.chatPanel}>
                    <div className={styles.chatHeader}>
                        <h3 className={styles.chatTitle}>In-call messages</h3>
                        <IconButton
                            size="small"
                            onClick={() => setShowChat(false)}
                            sx={{ color: '#5f6368' }}
                        >
                            <CloseIcon />
                        </IconButton>
                    </div>

                    <div className={styles.chatNoticeBox}>
                        Messages can only be seen by people in the call and are deleted when the call ends.
                    </div>

                    <div className={styles.chatMessageList}>
                        {messages.length === 0 ? (
                            <div className={styles.chatEmptyState}>
                                <ChatIcon sx={{ fontSize: 44, color: '#bdc1c6', mb: 1 }} />
                                <Typography variant="body2" sx={{ fontWeight: 500, color: '#3c4043', mb: 0.5 }}>
                                    No messages yet
                                </Typography>
                                <Typography variant="caption" sx={{ color: '#70757a' }}>
                                    Send a message to everyone in the call.
                                </Typography>
                            </div>
                        ) : (
                            messages.map((item, index) => {
                                const isSelf = item.sender === (usernameRef.current || username || 'You');
                                return (
                                    <div
                                        key={index}
                                        className={`${styles.chatMessageItem} ${isSelf ? styles.chatMessageItemSelf : styles.chatMessageItemOther}`}
                                    >
                                        <span className={styles.chatSenderName}>
                                            {isSelf ? 'You' : item.sender} {item.time ? `• ${item.time}` : ''}
                                        </span>
                                        <div className={`${styles.chatMessageBubble} ${isSelf ? styles.chatBubbleSelf : styles.chatBubbleOther}`}>
                                            {item.data}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                        <div ref={chatEndRef} />
                    </div>

                    <div className={styles.chatInputContainer}>
                        <TextField
                            fullWidth
                            size="small"
                            placeholder="Send a message to everyone"
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') sendMessage();
                            }}
                            variant="outlined"
                            sx={{
                                '& .MuiOutlinedInput-root': {
                                    borderRadius: 3,
                                    fontSize: '0.9rem'
                                }
                            }}
                        />
                        <IconButton
                            color="primary"
                            onClick={sendMessage}
                            disabled={!message.trim()}
                            sx={{
                                bgcolor: message.trim() ? '#1a73e8' : 'transparent',
                                color: message.trim() ? '#ffffff' : '#9aa0a6',
                                '&:hover': { bgcolor: message.trim() ? '#1557b0' : 'transparent' }
                            }}
                        >
                            <SendIcon fontSize="small" />
                        </IconButton>
                    </div>
                </div>
            )}

            {/* Notification Toast */}
            <Snackbar
                open={toast.open}
                autoHideDuration={4000}
                onClose={() => setToast((prev) => ({ ...prev, open: false }))}
                anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
            >
                <Alert
                    onClose={() => setToast((prev) => ({ ...prev, open: false }))}
                    severity={toast.severity}
                    variant="filled"
                    sx={{ width: '100%', borderRadius: 2 }}
                >
                    {toast.message}
                </Alert>
            </Snackbar>
        </div>
    );
}