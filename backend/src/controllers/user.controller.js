import { User } from "../models/user.model.js";
import { Meeting } from "../models/meeting.model.js";
import httpStatus from "http-status";
// import bcrypt, {hash} from "bcrypt";
import bcrypt from "bcryptjs";

import crypto from "crypto";

const login=async(req, res)=>{
    const{username, password}=req.body;
    if(!username || !password){
        return res.status(httpStatus.BAD_REQUEST).json({message:"Please provide username and password"})
    }
    try {
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(httpStatus.NOT_FOUND).json({ message: "User Not Found" })
        }


        let isPasswordCorrect = await bcrypt.compare(password, user.password)

        if (isPasswordCorrect) {
            let token = crypto.randomBytes(20).toString("hex");

            user.token = token;
            await user.save();
            return res.status(httpStatus.OK).json({ token: token })
        } else {
            return res.status(httpStatus.UNAUTHORIZED).json({ message: "Invalid Username or password" })
        }

    } catch (e) {
        return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: "Something went wrong" })
    }
}

const register=async(req, res)=>{
    const{name, username, password}=req.body;

    if (!name || !username || !password) {
        return res.status(httpStatus.BAD_REQUEST).json({ message: "Please provide all fields" });
    }

    try{
        const existingUser=await User.findOne({username});
        if(existingUser){
            return res.status(httpStatus.CONFLICT).json({message: "User already exists"});
        }
        const hashedPassword=await bcrypt.hash(password, 10);

        const newUser=new User({
            name: name,
            username: username,
            password: hashedPassword
        });

        await newUser.save();

        res.status(httpStatus.CREATED).json({message:"User Registered"})
    }catch(e){
        if (e.code === 11000) {
            return res.status(httpStatus.CONFLICT).json({ message: "User already exists" });
        }
        return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: "Something went wrong" });
    }
}

const getUserHistory = async (req, res) => {
    const { token } = req.query;

    try {
        const user = await User.findOne({ token: token });
        if (!user) {
            return res.status(httpStatus.NOT_FOUND).json({ message: "User Not Found" });
        }

        const meetings = await Meeting.find({ user_id: user.username });
        return res.json(meetings);
    } catch (e) {
        return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: `Something went wrong ${e}` });
    }
}

const addToActivity = async (req, res) => {
    const { token, meeting_code } = req.body;

    try {
        const user = await User.findOne({ token: token });
        if (!user) {
            return res.status(httpStatus.NOT_FOUND).json({ message: "User Not Found" });
        }

        let cleanCode = (meeting_code || "").trim();
        if (!cleanCode) {
            return res.status(httpStatus.BAD_REQUEST).json({ message: "Meeting code is required" });
        }

        if (cleanCode.includes("/")) {
            const parts = cleanCode.split("/").filter(Boolean);
            cleanCode = parts[parts.length - 1] || cleanCode;
        }

        const escapedCode = cleanCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const existingMeeting = await Meeting.findOne({
            meetingCode: { $regex: new RegExp(`^${escapedCode}$`, "i") }
        }).sort({ date: 1 });

        const canonicalCode = existingMeeting ? existingMeeting.meetingCode : cleanCode;

        // Check if user already has this meeting recorded in their activity
        const existingUserMeeting = await Meeting.findOne({
            user_id: user.username,
            meetingCode: canonicalCode
        });

        if (!existingUserMeeting) {
            const newMeeting = new Meeting({
                user_id: user.username,
                meetingCode: canonicalCode,
                allowGuests: existingMeeting ? existingMeeting.allowGuests : true
            });
            await newMeeting.save();
        }

        return res.status(httpStatus.CREATED).json({
            message: "Added code to activity",
            meetingCode: canonicalCode
        });
    } catch (e) {
        return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: `Something went wrong ${e}` });
    }
}

const checkMeetingCode = async (req, res) => {
    const meetingCode = req.params.code || req.query.code || req.query.meetingCode;
    if (!meetingCode || !meetingCode.trim()) {
        return res.status(httpStatus.BAD_REQUEST).json({ message: "Please provide a meeting code" });
    }
    try {
        let cleanCode = meetingCode.trim();
        if (cleanCode.includes("/")) {
            const parts = cleanCode.split("/").filter(Boolean);
            cleanCode = parts[parts.length - 1] || cleanCode;
        }

        const escapedCode = cleanCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const meeting = await Meeting.findOne({
            meetingCode: { $regex: new RegExp(`^${escapedCode}$`, "i") }
        }).sort({ date: 1 });

        if (!meeting) {
            return res.status(httpStatus.NOT_FOUND).json({ message: "Meeting not found. Please check your meeting code." });
        }
        return res.status(httpStatus.OK).json({
            exists: true,
            meetingCode: meeting.meetingCode,
            allowGuests: meeting.allowGuests !== false,
            hostUsername: meeting.user_id
        });
    } catch (e) {
        return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: `Something went wrong: ${e.message}` });
    }
}

const updateMeetingGuestAccess = async (req, res) => {
    const { token, meetingCode, allowGuests } = req.body;
    if (!token || !meetingCode) {
        return res.status(httpStatus.BAD_REQUEST).json({ message: "Token and meeting code are required" });
    }

    try {
        const user = await User.findOne({ token });
        if (!user) {
            return res.status(httpStatus.UNAUTHORIZED).json({ message: "Invalid or expired token" });
        }

        let cleanCode = meetingCode.trim();
        if (cleanCode.includes("/")) {
            const parts = cleanCode.split("/").filter(Boolean);
            cleanCode = parts[parts.length - 1] || cleanCode;
        }

        const escapedCode = cleanCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const meeting = await Meeting.findOne({
            meetingCode: { $regex: new RegExp(`^${escapedCode}$`, "i") }
        }).sort({ date: 1 });

        if (!meeting) {
            return res.status(httpStatus.NOT_FOUND).json({ message: "Meeting not found" });
        }

        if (meeting.user_id !== user.username) {
            return res.status(httpStatus.FORBIDDEN).json({ message: "Only the meeting host can change guest access settings" });
        }

        meeting.allowGuests = Boolean(allowGuests);
        await meeting.save();

        return res.status(httpStatus.OK).json({
            message: "Guest access setting updated successfully",
            allowGuests: meeting.allowGuests
        });
    } catch (e) {
        return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: `Something went wrong: ${e.message}` });
    }
}

const getUserDetails = async (req, res) => {
    const { token } = req.query;
    if (!token) {
        return res.status(httpStatus.BAD_REQUEST).json({ message: "Token is required" });
    }
    try {
        const user = await User.findOne({ token });
        if (!user) {
            return res.status(httpStatus.NOT_FOUND).json({ message: "User not found" });
        }
        return res.status(httpStatus.OK).json({
            name: user.name,
            username: user.username
        });
    } catch (e) {
        return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: `Something went wrong: ${e.message}` });
    }
}

export { login, register, getUserHistory, addToActivity, checkMeetingCode, updateMeetingGuestAccess, getUserDetails }