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
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import { useLocation, useParams, useNavigate } from 'react-router-dom';
import styles from '../styles/videoComponent.module.css';
import server from '../environment';

const server_url = server.replace(/\/+$/, '');

const getIceServers = () => {
    const defaultServers = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
    ];

    try {
        if (process.env.REACT_APP_ICE_SERVERS) {
            const customServers = JSON.parse(process.env.REACT_APP_ICE_SERVERS);
            if (Array.isArray(customServers) && customServers.length > 0) {
                return customServers;
            }
        }
    } catch (e) {
        console.warn('[WebRTC] Could not parse REACT_APP_ICE_SERVERS:', e);
    }

    if (process.env.REACT_APP_TURN_URL) {
        defaultServers.push({
            urls: process.env.REACT_APP_TURN_URL,
            username: process.env.REACT_APP_TURN_USERNAME || '',
            credential: process.env.REACT_APP_TURN_CREDENTIAL || ''
        });
    }

    return defaultServers;
};

const peerConfigConnections = {
    iceServers: getIceServers(),
    iceCandidatePoolSize: 10
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
    const initialVideoOn = Boolean(incomingState?.videoEnabled);
    const initialAudioOn = Boolean(incomingState?.audioEnabled);

    // Meeting status & Host Access Control
    const [meetingLoading, setMeetingLoading] = useState(true);
    const [meetingNotFound, setMeetingNotFound] = useState(false);
    const [isHost, setIsHost] = useState(false);
    const [allowGuests, setAllowGuests] = useState(true);
    const [isGuestBlocked, setIsGuestBlocked] = useState(false);
    const [hostUpdating, setHostUpdating] = useState(false);

    // Media states
    const [video, setVideo] = useState(initialVideoOn);
    const [audio, setAudio] = useState(initialAudioOn);
    const [screen, setScreen] = useState(false);
    const [audioAutoplayBlocked, setAudioAutoplayBlocked] = useState(false);
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
    const makingOfferRef = useRef({});
    const iceCandidateQueueRef = useRef({});
    const remoteStreamsRef = useRef({});
    const remoteVideoRefs = useRef({});
    const remoteAudioRefs = useRef({});
    const peerNamesRef = useRef({});
    const peerMediaStatesRef = useRef({});
    const usernameRef = useRef(initialGuestName);
    const videoRef = useRef([]);
    const chatEndRef = useRef(null);

    // Real-time boolean refs to avoid stale closures in WebRTC callbacks
    const videoRefCurrent = useRef(initialVideoOn);
    const audioRefCurrent = useRef(initialAudioOn);
    const screenRefCurrent = useRef(false);

    // Synchronize username and meetingCode refs
    useEffect(() => {
        usernameRef.current = username;
    }, [username]);

    useEffect(() => {
        meetingCodeRef.current = meetingCode;
    }, [meetingCode]);

    useEffect(() => {
        videoRefCurrent.current = video;
    }, [video]);

    useEffect(() => {
        audioRefCurrent.current = audio;
    }, [audio]);

    useEffect(() => {
        screenRefCurrent.current = screen;
    }, [screen]);

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

    // Helper to find the correct audio or video sender on an RTCPeerConnection
    const getTrackSender = useCallback((pc, kind) => {
        if (!pc) return null;
        try {
            if (pc.getSenders) {
                const senders = pc.getSenders();
                const senderWithTrack = senders.find((s) => s.track && s.track.kind === kind);
                if (senderWithTrack) return senderWithTrack;
            }

            if (pc.getTransceivers) {
                const transceivers = pc.getTransceivers();
                const matched = transceivers.find((t) =>
                    (t.receiver && t.receiver.track && t.receiver.track.kind === kind) ||
                    (t.sender && t.sender.track && t.sender.track.kind === kind)
                );
                if (matched && matched.sender) return matched.sender;
            }

            return null;
        } catch (e) {
            console.warn('[WebRTC] getTrackSender warning:', e);
            return null;
        }
    }, []);

    // Helper to flush queued ICE candidates once remote description is set
    const flushIceCandidates = useCallback((peerId) => {
        const pc = connectionsRef.current[peerId];
        if (!pc || !pc.remoteDescription) return;

        const queue = iceCandidateQueueRef.current[peerId] || [];
        if (queue.length > 0) {
            console.log(`[WebRTC] Flushing ${queue.length} queued ICE candidates for ${peerId}`);
            iceCandidateQueueRef.current[peerId] = [];
            queue.forEach((candidate) => {
                pc.addIceCandidate(new RTCIceCandidate(candidate))
                    .then(() => console.log(`[WebRTC] Added queued ICE candidate for ${peerId}`))
                    .catch((err) => console.warn(`[WebRTC] Error adding queued ICE candidate for ${peerId}:`, err));
            });
        }
    }, []);

    // Broadcast media state changes to all peers
    const broadcastMediaState = useCallback((newVideoState, newAudioState, newScreenState) => {
        const payload = JSON.stringify({
            type: 'media-toggle',
            isVideoOn: Boolean(newVideoState),
            isAudioOn: Boolean(newAudioState),
            isScreenSharing: Boolean(newScreenState),
            userName: usernameRef.current || username || 'Participant',
            meetingId: meetingCodeRef.current || meetingCode,
            fromId: socketIdRef.current
        });

        for (let peerId in connectionsRef.current) {
            if (socketRef.current) {
                socketRef.current.emit('signal', peerId, payload);
            }
        }
    }, [username, meetingCode]);

    // Renegotiate peer connection when tracks or media state change
    const renegotiate = useCallback(async (peerId) => {
        const pc = connectionsRef.current[peerId];
        if (!pc) return;
        if (pc.signalingState !== 'stable') {
            console.log(`[WebRTC] Skipping renegotiation for ${peerId} (signalingState is ${pc.signalingState})`);
            return;
        }

        try {
            makingOfferRef.current[peerId] = true;
            console.log(`[WebRTC] Creating renegotiation offer for ${peerId}`);
            const offer = await pc.createOffer();
            if (pc.signalingState !== 'stable') return;
            await pc.setLocalDescription(offer);

            if (socketRef.current) {
                socketRef.current.emit(
                    'signal',
                    peerId,
                    JSON.stringify({
                        sdp: pc.localDescription,
                        meetingId: meetingCodeRef.current || meetingCode,
                        fromId: socketIdRef.current,
                        toId: peerId,
                        userName: usernameRef.current || username || 'Participant',
                        type: 'media-toggle',
                        isVideoOn: videoRefCurrent.current || screenRefCurrent.current,
                        isAudioOn: audioRefCurrent.current,
                        isScreenSharing: screenRefCurrent.current
                    })
                );
            }
        } catch (err) {
            console.error(`[WebRTC] Error during renegotiation with ${peerId}:`, err);
        } finally {
            makingOfferRef.current[peerId] = false;
        }
    }, [meetingCode, username]);

    // Create or retrieve RTCPeerConnection for a peer ID
    const getOrCreatePeerConnection = useCallback((peerId) => {
        if (connectionsRef.current[peerId]) {
            return connectionsRef.current[peerId];
        }

        console.log(`[WebRTC] Creating RTCPeerConnection for ${peerId}`);
        const pc = new RTCPeerConnection(peerConfigConnections);
        connectionsRef.current[peerId] = pc;
        makingOfferRef.current[peerId] = false;

        // ICE candidate handler
        pc.onicecandidate = (event) => {
            if (event.candidate && socketRef.current) {
                socketRef.current.emit(
                    'signal',
                    peerId,
                    JSON.stringify({
                        ice: event.candidate,
                        meetingId: meetingCodeRef.current || meetingCode,
                        fromId: socketIdRef.current,
                        toId: peerId
                    })
                );
            }
        };

        // ICE connection state & connection monitoring
        pc.oniceconnectionstatechange = () => {
            console.log(`[WebRTC] ICE state with ${peerId}: ${pc.iceConnectionState}`);
            if (pc.iceConnectionState === 'failed') {
                console.warn(`[WebRTC] ICE failed with ${peerId}, attempting ICE restart`);
                if (pc.restartIce) {
                    pc.restartIce();
                }
                renegotiate(peerId);
            }
        };

        pc.onconnectionstatechange = () => {
            console.log(`[WebRTC] Connection state with ${peerId}: ${pc.connectionState}`);
        };

        // Pre-create transceivers so media sections exist in SDP
        try {
            pc.addTransceiver('video', { direction: 'sendrecv' });
            pc.addTransceiver('audio', { direction: 'sendrecv' });
        } catch (e) {
            console.warn('[WebRTC] addTransceiver note:', e);
        }

        // Attach local tracks if already available
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach((track) => {
                const sender = getTrackSender(pc, track.kind);
                if (sender) {
                    sender.replaceTrack(track).catch(() => {});
                } else {
                    try {
                        pc.addTrack(track, localStreamRef.current);
                    } catch (e) {}
                }
            });
        }

        if (screenStreamRef.current) {
            screenStreamRef.current.getTracks().forEach((track) => {
                const sender = getTrackSender(pc, track.kind);
                if (sender) {
                    sender.replaceTrack(track).catch(() => {});
                } else {
                    try {
                        pc.addTrack(track, screenStreamRef.current);
                    } catch (e) {}
                }
            });
        }

        // Incoming track handler
        pc.ontrack = (event) => {
            console.log(`[WebRTC] Remote track received from ${peerId} (${event.track.kind})`);
            if (!remoteStreamsRef.current[peerId]) {
                remoteStreamsRef.current[peerId] = new MediaStream();
            }
            const peerStream = remoteStreamsRef.current[peerId];

            if (!peerStream.getTracks().some((t) => t.id === event.track.id)) {
                peerStream.addTrack(event.track);
            }

            // Bind to remote video element if mounted
            if (remoteVideoRefs.current[peerId]) {
                const videoEl = remoteVideoRefs.current[peerId];
                if (videoEl.srcObject !== peerStream) {
                    videoEl.srcObject = peerStream;
                }
                videoEl.play().catch((err) => console.warn(`[WebRTC] Autoplay note for video ${peerId}:`, err));
            }

            // Bind to dedicated remote audio element
            if (remoteAudioRefs.current[peerId]) {
                const audioEl = remoteAudioRefs.current[peerId];
                if (audioEl.srcObject !== peerStream) {
                    audioEl.srcObject = peerStream;
                }
                audioEl.play().catch((err) => {
                    if (err.name === 'NotAllowedError') {
                        console.warn(`[WebRTC] Audio autoplay blocked for ${peerId}`);
                        setAudioAutoplayBlocked(true);
                    }
                });
            }

            setVideos((prevVideos) =>
                prevVideos.map((v) =>
                    v.socketId === peerId
                        ? {
                              ...v,
                              stream: peerStream,
                              userName: v.userName || peerNamesRef.current[peerId] || 'Participant',
                              isVideoOn: event.track.kind === 'video' ? true : v.isVideoOn
                          }
                        : v
                )
            );
        };

        // Fallback onaddstream
        pc.onaddstream = (event) => {
            console.log(`[WebRTC] onaddstream from ${peerId}`);
            remoteStreamsRef.current[peerId] = event.stream;

            if (remoteVideoRefs.current[peerId]) {
                remoteVideoRefs.current[peerId].srcObject = event.stream;
                remoteVideoRefs.current[peerId].play().catch(() => {});
            }
            if (remoteAudioRefs.current[peerId]) {
                remoteAudioRefs.current[peerId].srcObject = event.stream;
                remoteAudioRefs.current[peerId].play().catch((err) => {
                    if (err.name === 'NotAllowedError') setAudioAutoplayBlocked(true);
                });
            }

            setVideos((prevVideos) =>
                prevVideos.map((v) =>
                    v.socketId === peerId
                        ? {
                              ...v,
                              stream: event.stream,
                              userName: v.userName || peerNamesRef.current[peerId] || 'Participant'
                          }
                        : v
                )
            );
        };

        return pc;
    }, [getTrackSender, renegotiate, meetingCode]);

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
        screenRefCurrent.current = false;

        const localStream = localStreamRef.current;
        const cameraTrack = localStream?.getVideoTracks().find((t) => t.readyState === 'live');

        if (videoRefCurrent.current && cameraTrack) {
            console.log('[WebRTC] Restoring camera track after screen share');
            for (let id in connectionsRef.current) {
                const pc = connectionsRef.current[id];
                const videoSender = getTrackSender(pc, 'video');
                if (videoSender) {
                    videoSender.replaceTrack(cameraTrack).catch((err) => console.error('[WebRTC] Error restoring camera track:', err));
                }
            }
            if (localVideoref.current) {
                localVideoref.current.srcObject = localStream;
            }
            broadcastMediaState(true, audioRefCurrent.current, false);
        } else {
            console.log('[WebRTC] Camera is off, resetting video sender to null');
            for (let id in connectionsRef.current) {
                const pc = connectionsRef.current[id];
                const videoSender = getTrackSender(pc, 'video');
                if (videoSender) {
                    videoSender.replaceTrack(null).catch((err) => console.error('[WebRTC] Error clearing video track:', err));
                }
            }
            if (localVideoref.current) {
                localVideoref.current.srcObject = null;
            }
            broadcastMediaState(false, audioRefCurrent.current, false);
        }
    }, [broadcastMediaState, getTrackSender]);

    // Handle incoming WebRTC signaling message
    const gotMessageFromServer = useCallback(async (fromId, messagePayload) => {
        try {
            const signal = typeof messagePayload === 'object' && messagePayload !== null
                ? messagePayload
                : JSON.parse(messagePayload);

            if (!fromId || fromId === socketIdRef.current) return;

            // Update peer display name
            if (signal.userName) {
                peerNamesRef.current[fromId] = signal.userName;
                setVideos((prevVideos) =>
                    prevVideos.map((v) => (v.socketId === fromId ? { ...v, userName: signal.userName } : v))
                );
            }

            // Update peer media toggle states
            if (signal.type === 'media-toggle') {
                console.log(`[WebRTC] media-toggle from ${fromId}: video=${signal.isVideoOn}, audio=${signal.isAudioOn}`);
                peerMediaStatesRef.current[fromId] = {
                    isVideoOn: Boolean(signal.isVideoOn),
                    isAudioOn: Boolean(signal.isAudioOn),
                    isScreenSharing: Boolean(signal.isScreenSharing)
                };

                setVideos((prevVideos) =>
                    prevVideos.map((v) => {
                        if (v.socketId === fromId) {
                            return {
                                ...v,
                                isVideoOn: signal.isVideoOn !== undefined ? Boolean(signal.isVideoOn) : v.isVideoOn,
                                isAudioOn: signal.isAudioOn !== undefined ? Boolean(signal.isAudioOn) : v.isAudioOn,
                                isScreenSharing: signal.isScreenSharing !== undefined ? Boolean(signal.isScreenSharing) : v.isScreenSharing,
                                userName: signal.userName || v.userName
                            };
                        }
                        return v;
                    })
                );
            }

            // Ensure RTCPeerConnection exists for sender
            const pc = getOrCreatePeerConnection(fromId);

            // ICE Candidate handling
            if (signal.ice) {
                if (!pc.remoteDescription || !pc.remoteDescription.type) {
                    console.log(`[WebRTC] Queuing ICE candidate from ${fromId} (remoteDescription not set)`);
                    if (!iceCandidateQueueRef.current[fromId]) {
                        iceCandidateQueueRef.current[fromId] = [];
                    }
                    iceCandidateQueueRef.current[fromId].push(signal.ice);
                } else {
                    pc.addIceCandidate(new RTCIceCandidate(signal.ice))
                        .catch((e) => {
                            console.warn(`[WebRTC] Error adding ICE candidate from ${fromId}, queueing:`, e);
                            if (!iceCandidateQueueRef.current[fromId]) {
                                iceCandidateQueueRef.current[fromId] = [];
                            }
                            iceCandidateQueueRef.current[fromId].push(signal.ice);
                        });
                }
            }

            // SDP handling
            if (signal.sdp) {
                if (signal.sdp.type === 'offer') {
                    console.log(`[WebRTC] Received offer from ${fromId}`);
                    // Perfect negotiation glare handling: polite peer rolls back and accepts offer
                    const isPolite = String(socketIdRef.current) > String(fromId);
                    const offerCollision = makingOfferRef.current[fromId] || pc.signalingState !== 'stable';

                    if (offerCollision) {
                        if (!isPolite) {
                            console.log(`[WebRTC] Offer collision with ${fromId}: impolite peer ignoring remote offer`);
                            return;
                        }
                        console.log(`[WebRTC] Offer collision with ${fromId}: polite peer rolling back`);
                        await pc.setLocalDescription({ type: 'rollback' }).catch(() => {});
                    }

                    await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
                    flushIceCandidates(fromId);

                    const answer = await pc.createAnswer();
                    await pc.setLocalDescription(answer);

                    if (socketRef.current) {
                        console.log(`[WebRTC] Sending answer to ${fromId}`);
                        socketRef.current.emit(
                            'signal',
                            fromId,
                            JSON.stringify({
                                sdp: pc.localDescription,
                                meetingId: meetingCodeRef.current || meetingCode,
                                fromId: socketIdRef.current,
                                toId: fromId,
                                userName: usernameRef.current || username || 'Participant',
                                type: 'media-toggle',
                                isVideoOn: videoRefCurrent.current || screenRefCurrent.current,
                                isAudioOn: audioRefCurrent.current,
                                isScreenSharing: screenRefCurrent.current
                            })
                        );
                    }
                } else if (signal.sdp.type === 'answer') {
                    console.log(`[WebRTC] Received answer from ${fromId}`);
                    if (pc.signalingState === 'have-local-offer') {
                        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
                        flushIceCandidates(fromId);
                    } else {
                        console.log(`[WebRTC] Ignoring answer from ${fromId} because signalingState is ${pc.signalingState}`);
                    }
                }
            }
        } catch (err) {
            console.error(`[WebRTC] Error handling signal from ${fromId}:`, err);
        }
    }, [getOrCreatePeerConnection, flushIceCandidates, meetingCode, username]);

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
                delete remoteAudioRefs.current[id];
                delete peerNamesRef.current[id];
                delete peerMediaStatesRef.current[id];
                delete iceCandidateQueueRef.current[id];
                delete makingOfferRef.current[id];
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

                    // Ensure RTCPeerConnection exists
                    getOrCreatePeerConnection(socketListId);

                    // Share our current name and media status with peer
                    if (socketRef.current) {
                        socketRef.current.emit(
                            'signal',
                            socketListId,
                            JSON.stringify({
                                userName: usernameRef.current || username || 'Participant',
                                meetingId: meetingCodeRef.current || meetingCode,
                                fromId: socketIdRef.current,
                                toId: socketListId,
                                type: 'media-toggle',
                                isVideoOn: videoRefCurrent.current || screenRefCurrent.current,
                                isAudioOn: audioRefCurrent.current,
                                isScreenSharing: screenRefCurrent.current
                            })
                        );
                    }
                });

                // If this is the newly joined user, initiate offer to existing peers
                if (id === socketIdRef.current) {
                    for (let id2 in connectionsRef.current) {
                        if (id2 === socketIdRef.current) continue;
                        const peer = connectionsRef.current[id2];
                        makingOfferRef.current[id2] = true;
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
                                                meetingId: meetingCodeRef.current || meetingCode,
                                                fromId: socketIdRef.current,
                                                toId: id2,
                                                userName: usernameRef.current || username || 'Participant',
                                                type: 'media-toggle',
                                                isVideoOn: videoRefCurrent.current || screenRefCurrent.current,
                                                isAudioOn: audioRefCurrent.current,
                                                isScreenSharing: screenRefCurrent.current
                                            })
                                        );
                                    }
                                });
                            })
                            .catch((e) => console.error(`[WebRTC] Error creating offer for ${id2}:`, e))
                            .finally(() => {
                                makingOfferRef.current[id2] = false;
                            });
                    }
                }
            });
        });
    }, [addMessage, gotMessageFromServer, getOrCreatePeerConnection, meetingCode, isHost, username]);

    // Initial media setup if requested from guest lobby
    useEffect(() => {
        let isMounted = true;
        if ((initialVideoOn || initialAudioOn) && !localStreamRef.current) {
            console.log('[WebRTC] Acquiring initial media requested from lobby');
            navigator.mediaDevices.getUserMedia({
                video: initialVideoOn ? { width: { ideal: 640 }, height: { ideal: 480 } } : false,
                audio: initialAudioOn ? true : false
            }).then((stream) => {
                if (!isMounted) {
                    stream.getTracks().forEach((t) => t.stop());
                    return;
                }
                localStreamRef.current = stream;
                if (localVideoref.current && initialVideoOn) {
                    localVideoref.current.srcObject = stream;
                }
                setVideo(initialVideoOn);
                setAudio(initialAudioOn);
                videoRefCurrent.current = initialVideoOn;
                audioRefCurrent.current = initialAudioOn;

                for (let peerId in connectionsRef.current) {
                    const pc = connectionsRef.current[peerId];
                    stream.getTracks().forEach((track) => {
                        const sender = getTrackSender(pc, track.kind);
                        if (sender) {
                            sender.replaceTrack(track).catch(() => {});
                        } else {
                            try { pc.addTrack(track, stream); } catch (e) {}
                        }
                    });
                }
            }).catch((err) => {
                console.warn('[WebRTC] Could not acquire initial media from lobby:', err);
                if (initialVideoOn && initialAudioOn) {
                    navigator.mediaDevices.getUserMedia({ audio: true }).then((aStream) => {
                        if (!isMounted) return;
                        localStreamRef.current = aStream;
                        setAudio(true);
                        setVideo(false);
                        videoRefCurrent.current = false;
                        audioRefCurrent.current = true;
                    }).catch(() => {
                        setAudio(false);
                        setVideo(false);
                        videoRefCurrent.current = false;
                        audioRefCurrent.current = false;
                    });
                } else {
                    setAudio(false);
                    setVideo(false);
                    videoRefCurrent.current = false;
                    audioRefCurrent.current = false;
                }
            });
        }
        return () => {
            isMounted = false;
        };
    }, [initialVideoOn, initialAudioOn, getTrackSender]);

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
            makingOfferRef.current = {};
            remoteStreamsRef.current = {};
            remoteVideoRefs.current = {};
            remoteAudioRefs.current = {};

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
            videoRefCurrent.current = false;

            if (localStreamRef.current) {
                localStreamRef.current.getVideoTracks().forEach((track) => {
                    try { track.stop(); } catch (e) {}
                    localStreamRef.current.removeTrack(track);
                });
            }

            if (localVideoref.current && !screenRefCurrent.current) {
                localVideoref.current.srcObject = null;
            }

            if (!screenRefCurrent.current) {
                for (let id in connectionsRef.current) {
                    const pc = connectionsRef.current[id];
                    const videoSender = getTrackSender(pc, 'video');
                    if (videoSender) {
                        try {
                            await videoSender.replaceTrack(null);
                        } catch (err) {
                            console.warn('[WebRTC] Error removing video track:', err);
                        }
                    }
                }
            }

            broadcastMediaState(false, audioRefCurrent.current, screenRefCurrent.current);
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

                if (localVideoref.current && !screenRefCurrent.current) {
                    localVideoref.current.srcObject = localStreamRef.current;
                }

                setVideo(true);
                videoRefCurrent.current = true;

                // Handle unexpected device disconnection
                newVideoTrack.onended = () => {
                    console.warn('[WebRTC] Video track ended unexpectedly (device disconnected)');
                    handleToggleVideo();
                };

                if (!screenRefCurrent.current) {
                    for (let id in connectionsRef.current) {
                        const pc = connectionsRef.current[id];
                        const videoSender = getTrackSender(pc, 'video');
                        if (videoSender) {
                            try {
                                await videoSender.replaceTrack(newVideoTrack);
                            } catch (err) {
                                console.warn(`[WebRTC] replaceTrack error for ${id}, attempting addTrack:`, err);
                                try {
                                    pc.addTrack(newVideoTrack, localStreamRef.current);
                                    renegotiate(id);
                                } catch (addErr) {}
                            }
                        } else {
                            try {
                                pc.addTrack(newVideoTrack, localStreamRef.current);
                                renegotiate(id);
                            } catch (e) {}
                        }
                    }
                }

                broadcastMediaState(true, audioRefCurrent.current, screenRefCurrent.current);
            } catch (err) {
                console.error('[WebRTC] Camera access error:', err);
                let msg = 'Could not access camera. Please check permissions.';
                if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                    msg = 'Camera permission denied. Please allow camera access in browser settings.';
                } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
                    msg = 'No camera found on this device.';
                } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
                    msg = 'Camera is already in use by another application.';
                }
                setToast({ open: true, message: msg, severity: 'error' });
                setVideo(false);
                videoRefCurrent.current = false;
            }
        }
    };

    // TOGGLE MICROPHONE
    const handleToggleAudio = async () => {
        if (audio) {
            // Muting microphone
            setAudio(false);
            audioRefCurrent.current = false;

            if (localStreamRef.current) {
                localStreamRef.current.getAudioTracks().forEach((track) => {
                    try { track.stop(); } catch (e) {}
                    localStreamRef.current.removeTrack(track);
                });
            }

            for (let id in connectionsRef.current) {
                const pc = connectionsRef.current[id];
                const audioSender = getTrackSender(pc, 'audio');
                if (audioSender) {
                    try {
                        await audioSender.replaceTrack(null);
                    } catch (err) {
                        console.warn('[WebRTC] Error muting audio track:', err);
                    }
                }
            }

            broadcastMediaState(videoRefCurrent.current || screenRefCurrent.current, false, screenRefCurrent.current);
        } else {
            // Unmuting microphone
            try {
                const newStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                const newAudioTrack = newStream.getAudioTracks()[0];

                if (!localStreamRef.current) {
                    localStreamRef.current = new MediaStream();
                }
                localStreamRef.current.addTrack(newAudioTrack);

                setAudio(true);
                audioRefCurrent.current = true;

                // Handle unexpected mic disconnection
                newAudioTrack.onended = () => {
                    console.warn('[WebRTC] Audio track ended unexpectedly (device disconnected)');
                    handleToggleAudio();
                };

                for (let id in connectionsRef.current) {
                    const pc = connectionsRef.current[id];
                    const audioSender = getTrackSender(pc, 'audio');
                    if (audioSender) {
                        try {
                            await audioSender.replaceTrack(newAudioTrack);
                        } catch (err) {
                            console.warn(`[WebRTC] replaceTrack error for ${id}, attempting addTrack:`, err);
                            try {
                                pc.addTrack(newAudioTrack, localStreamRef.current);
                                renegotiate(id);
                            } catch (addErr) {}
                        }
                    } else {
                        try {
                            pc.addTrack(newAudioTrack, localStreamRef.current);
                            renegotiate(id);
                        } catch (e) {}
                    }
                }

                broadcastMediaState(videoRefCurrent.current || screenRefCurrent.current, true, screenRefCurrent.current);
            } catch (err) {
                console.error('[WebRTC] Mic access error:', err);
                let msg = 'Could not access microphone. Please check permissions.';
                if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                    msg = 'Microphone permission denied. Please allow microphone access in browser settings.';
                } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
                    msg = 'No microphone found on this device.';
                } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
                    msg = 'Microphone is already in use by another application.';
                }
                setToast({ open: true, message: msg, severity: 'error' });
                setAudio(false);
                audioRefCurrent.current = false;
            }
        }
    };

    // TOGGLE SCREEN SHARE
    const handleToggleScreen = async () => {
        if (screen) {
            stopScreenShare();
        } else {
            try {
                if (!navigator.mediaDevices?.getDisplayMedia) {
                    setToast({ open: true, message: 'Screen sharing is not supported on this browser.', severity: 'warning' });
                    return;
                }
                const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
                const screenTrack = screenStream.getVideoTracks()[0];

                screenStreamRef.current = screenStream;
                setScreen(true);
                screenRefCurrent.current = true;

                screenTrack.onended = () => {
                    stopScreenShare();
                };

                for (let id in connectionsRef.current) {
                    const pc = connectionsRef.current[id];
                    const videoSender = getTrackSender(pc, 'video');
                    if (videoSender) {
                        videoSender.replaceTrack(screenTrack).catch((err) => console.error('[WebRTC] Error setting screen track:', err));
                    } else {
                        try {
                            pc.addTrack(screenTrack, screenStream);
                            renegotiate(id);
                        } catch (e) {}
                    }
                }

                if (localVideoref.current) {
                    localVideoref.current.srcObject = screenStream;
                }

                broadcastMediaState(true, audioRefCurrent.current, true);
            } catch (err) {
                console.error('[WebRTC] Screen sharing error:', err);
                setScreen(false);
                screenRefCurrent.current = false;
            }
        }
    };

    // Resume remote audio playback if browser autoplay restrictions blocked it
    const handleUnblockAudio = () => {
        Object.values(remoteAudioRefs.current).forEach((audioEl) => {
            if (audioEl) {
                audioEl.play().catch(() => {});
            }
        });
        setAudioAutoplayBlocked(false);
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
        makingOfferRef.current = {};
        remoteStreamsRef.current = {};
        remoteVideoRefs.current = {};
        remoteAudioRefs.current = {};

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

            {/* Browser Autoplay Blocked Banner */}
            {audioAutoplayBlocked && (
                <div className={styles.audioBlockedBanner} onClick={handleUnblockAudio}>
                    <VolumeUpIcon sx={{ fontSize: 20 }} />
                    <span>Meeting audio was paused by your browser. Click here to enable audio.</span>
                    <Button
                        size="small"
                        variant="contained"
                        sx={{
                            ml: 1,
                            bgcolor: '#ffffff',
                            color: '#d93025',
                            textTransform: 'none',
                            fontWeight: 600,
                            '&:hover': { bgcolor: '#f1f3f4' }
                        }}
                    >
                        Unmute Audio
                    </Button>
                </div>
            )}

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
                        const peerStream = peer.stream || remoteStreamsRef.current[peer.socketId];
                        const hasLiveVideoTrack = Boolean(
                            peerStream &&
                            peerStream.getVideoTracks().some((t) => t.readyState === 'live' && t.enabled)
                        );
                        const showVideo = Boolean(peer.isVideoOn && hasLiveVideoTrack);

                        return (
                            <div key={peer.socketId} className={styles.participantTile}>
                                {/* DEDICATED AUDIO ELEMENT FOR REMOTE PARTICIPANT (plays continuously regardless of camera state) */}
                                <audio
                                    data-socket={peer.socketId}
                                    ref={(ref) => {
                                        if (ref) {
                                            remoteAudioRefs.current[peer.socketId] = ref;
                                            const stream = peer.stream || remoteStreamsRef.current[peer.socketId];
                                            if (stream && ref.srcObject !== stream) {
                                                ref.srcObject = stream;
                                            }
                                            ref.play().catch((err) => {
                                                if (err.name === 'NotAllowedError') {
                                                    setAudioAutoplayBlocked(true);
                                                }
                                            });
                                        }
                                    }}
                                    autoPlay
                                    playsInline
                                />

                                {/* VIDEO ELEMENT FOR REMOTE PARTICIPANT */}
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
                                    muted
                                    className={styles.tileVideo}
                                    style={{ display: showVideo ? 'block' : 'none' }}
                                />

                                {!showVideo && (
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