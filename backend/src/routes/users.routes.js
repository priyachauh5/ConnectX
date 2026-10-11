import { Router } from "express";
import { login, register, addToActivity, getUserHistory, checkMeetingCode, updateMeetingGuestAccess, getUserDetails } from "../controllers/user.controller.js";

const router=Router();

router.route("/login").post(login)
router.route("/register").post(register)
router.route("/add_to_activity").post(addToActivity)
router.route("/get_all_activity").get(getUserHistory)
router.route("/get_user_details").get(getUserDetails)
router.route("/validate_meeting").get(checkMeetingCode)
router.route("/validate_meeting/:code").get(checkMeetingCode)
router.route("/meeting/allow_guests").post(updateMeetingGuestAccess)

export default router;
