import express from "express";
import http from "http";
import cors from "cors";
import timeout from "connect-timeout";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import authorize from "routes/authorize.js";
import authenticate from "routes/authenticate.js";
import stripeWebhook from "webhooks/stripeWebhook.js";
import connectWebhook from "webhooks/connectWebhook.js";
import setHeaders from "middleware/setHeaders.js";
import addCsrfProtection from "middleware/addCsrfProtection.js";
import issueCsrfToken from "routes/issueCsrfToken.js";
import checkAccess from "middleware/checkAccess.js";
import getBeforeAfters from "routes/getBeforeAfters.js";
import startTheFlow from "routes/startTheFlow.js";
import addTaskToRoutine from "routes/addTaskToRoutine.js";
import analyzeFood from "routes/analyzeFood.js";
import rootRoute from "routes/rootRoute.js";
import getAllStyleRecords from "routes/getAllStyleRecords.js";
import getClubYouTrack from "routes/getClubYouTrack.js";
import getExistingFilters from "routes/getExistingFilters.js";
import getReviews from "routes/getReviews.js";
import getRewards from "routes/getRewards.js";
import checkVideoBlurStatus from "routes/checkVideoBlurStatus.js";
import createTaskFromDescription from "routes/createTaskFromDescription.js";
import createBillingPortalSession from "routes/createBillingPortalSession.js";
import createCheckoutSession from "routes/createCheckoutSession.js";
import createConnectAccount from "routes/createConnectAccount.js";
import claimReward from "routes/claimReward.js";
import findProducts from "routes/findProducts.js";
import createRecipe from "routes/createRecipe.js";
import getCalendarTasks from "routes/getCalendarTasks.js";
import getClubTrackYou from "routes/getClubTrackYou.js";
import checkAnalysisCompletion from "routes/checkAnalysisCompletion.js";
import getFollowHistory from "routes/getFollowHistory.js";
import getProofRecord from "routes/getProofRecord.js";
import getTaskInfo from "routes/getTaskInfo.js";
import editTask from "routes/editTask.js";
import getCompletedTasks from "routes/getCompletedTasks.js";
import getUsersProofAutocomplete from "routes/getUsersProofAutocomplete.js";
import getUsersProofRecords from "routes/getUsersProofRecords.js";
import getUsersStyleNames from "routes/getUsersStyleNames.js";
import getUsersStyleRecords from "routes/getUsersStyleRecords.js";
import startProgressAnalysis from "routes/startProgressAnalysis.js";
import startStyleAnalysis from "routes/startStyleAnalysis.js";
import startSubscriptionTrial from "routes/startSubscriptionTrial.js";
import startSuggestChangeAnalysis from "routes/startSuggestChangeAnalysis.js";
import uploadProgress from "routes/uploadProgress.js";
import uploadToSpaces from "routes/uploadToSpaces.js";
import getTaskProducts from "routes/getTaskProducts.js";
import getTasksProducts from "routes/getTasksProducts.js";
import getTrackedRoutines from "routes/getTrackedRoutines.js";
import getUserData from "routes/getUserData.js";
import joinClub from "routes/joinClub.js";
import leaveClub from "routes/leaveClub.js";
import publishStyleToClub from "routes/publishStyleToClub.js";
import redirectToWallet from "routes/redirectToWallet.js";
import replaceRoutine from "routes/replaceRoutine.js";
import saveAboutResponse from "routes/saveAboutResponse.js";
import saveTaskFromDescription from "routes/saveTaskFromDescription.js";
import trackUser from "routes/trackUser.js";
import updateAccountDeletion from "routes/updateAccountDeletion.js";
import updateClubData from "routes/updateClubData.js";
import updateClubPrivacy from "routes/updateClubPrivacy.js";
import updateContentBlurType from "routes/updateContentBlurType.js";
import updateProofUpload from "routes/updateProofUpload.js";
import updateRequiredSubmission from "routes/updateRequiredSubmission.js";
import updateSpecialConsiderations from "routes/updateSpecialConsiderations.js";
import updateStatusOfTasks from "routes/updateStatusOfTasks.js";
import uploadProof from "routes/uploadProof.js";
import voteForStyle from "routes/voteForStyle.js";
import withdrawReward from "routes/withdrawReward.js";
import metricCapturer from "middleware/metricCapturer.js";
import metrics from "routes/metrics.js";
import logCapturer from "middleware/logCapturer.js";
import errorHandler from "middleware/errorHandler.js";
import sendPasswordResetEmail from "@/routes/sendPasswordResetEmail.js";
import setPassword from "routes/setPassword.js";
import changeEmail from "routes/changeEmail.js";
import verifyEmail from "routes/verifyEmail.js";
import getAllProofRecords from "routes/getAllProofRecords.js"

import { client } from "init.js";

client.connect();

const app = express();
app.set("trust proxy", 1);

const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS?.split(","),
  methods: ["GET", "POST", "OPTIONS", "HEAD"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-CSRF-Token",
    "Access-Control-Allow-Credentials",
  ],
  credentials: true,
  optionsSuccessStatus: 200,
};

app.options("*", cors(corsOptions));

const limiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 180,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(logCapturer);
app.use(metricCapturer);

app.use("/stripeWebhook", stripeWebhook);
app.use("/connectWebhook", connectWebhook);

app.use(cookieParser());
app.use(express.json({ limit: "35mb" }));
app.use(express.urlencoded({ limit: "35mb", extended: true }));

app.use("*", setHeaders);
app.use("*", addCsrfProtection);

app.use(limiter);

app.use("/", rootRoute);

app.use(timeout("2m"));
app.use("/metrics", metrics);

app.use("/issueCsrfToken", issueCsrfToken);
app.use("/sendPasswordResetEmail", sendPasswordResetEmail);
app.use("/setPassword", setPassword);
app.use("/changeEmail", changeEmail);
app.use("/verifyEmail", verifyEmail);

app.use((req, res, next) => checkAccess(req, res, next, false));
app.use("/authorize", authorize);
app.use("/authenticate", authenticate);
app.use("/getBeforeAfters", getBeforeAfters);
app.use("/startTheFlow", startTheFlow);
app.use("/analyzeFood", analyzeFood);
app.use("/checkAnalysisCompletion", checkAnalysisCompletion);
app.use("/getAllStyleRecords", getAllStyleRecords);
app.use("/getBeforeAfters", getBeforeAfters);
app.use("/getClubYouTrack", getClubYouTrack);
app.use("/getExistingFilters", getExistingFilters);
app.use("/getReviews", getReviews);
app.use("/getRewards", getRewards);
app.use("/getAllStyleRecords", getAllStyleRecords);
app.use("/getBeforeAfters", getBeforeAfters);
app.use("/getUsersProofAutocomplete", getUsersProofAutocomplete);
app.use("/getUsersProofRecords", getUsersProofRecords);
app.use("/getUsersStyleNames", getUsersStyleNames);
app.use("/getUsersStyleRecords", getUsersStyleRecords);
app.use("/startProgressAnalysis", startProgressAnalysis);
app.use("/startStyleAnalysis", startStyleAnalysis);
app.use("/startSubscriptionTrial", startSubscriptionTrial);
app.use("/startSuggestChangeAnalysis", startSuggestChangeAnalysis);
app.use("/startTheFlow", startTheFlow);
app.use("/uploadProgress", uploadProgress);
app.use("/uploadToSpaces", uploadToSpaces);
app.use("/getAllProofRecords", getAllProofRecords);

// protected routes
app.use((req, res, next) => checkAccess(req, res, next, true));
app.use("/addTaskToRoutine", addTaskToRoutine);
app.use("/checkVideoBlurStatus", checkVideoBlurStatus);
app.use("/createTaskFromDescription", createTaskFromDescription);
app.use("/createBillingPortalSession", createBillingPortalSession);
app.use("/createCheckoutSession", createCheckoutSession);
app.use("/createConnectAccount", createConnectAccount);
app.use("/claimReward", claimReward);
app.use("/findProducts", findProducts);
app.use("/createRecipe", createRecipe);
app.use("/getCalendarTasks", getCalendarTasks);
app.use("/getClubTrackYou", getClubTrackYou);
app.use("/getCompletedTasks", getCompletedTasks);
app.use("/getFollowHistory", getFollowHistory);
app.use("/getProofRecord", getProofRecord);
app.use("/getTaskInfo", getTaskInfo);
app.use("/editTask", editTask);
app.use("/findProducts", findProducts);
app.use("/getCalendarTasks", getCalendarTasks);
app.use("/getTaskProducts", getTaskProducts);
app.use("/getTasksProducts", getTasksProducts);
app.use("/getTrackedRoutines", getTrackedRoutines);
app.use("/getUserData", getUserData);
app.use("/joinClub", joinClub);
app.use("/leaveClub", leaveClub);
app.use("/publishStyleToClub", publishStyleToClub);
app.use("/redirectToWallet", redirectToWallet);
app.use("/replaceRoutine", replaceRoutine);
app.use("/saveAboutResponse", saveAboutResponse);
app.use("/saveTaskFromDescription", saveTaskFromDescription);
app.use("/trackUser", trackUser);
app.use("/updateAccountDeletion", updateAccountDeletion);
app.use("/updateClubData", updateClubData);
app.use("/updateClubPrivacy", updateClubPrivacy);
app.use("/updateContentBlurType", updateContentBlurType);
app.use("/updateProofUpload", updateProofUpload);
app.use("/updateRequiredSubmission", updateRequiredSubmission);
app.use("/updateSpecialConsiderations", updateSpecialConsiderations);
app.use("/updateStatusOfTasks", updateStatusOfTasks);
app.use("/uploadProof", uploadProof);
app.use("/voteForStyle", voteForStyle);
app.use("/withdrawReward", withdrawReward);

app.use(errorHandler);

const port = process.env.PORT || 3001;
const httpServer = http.createServer(app);
httpServer.listen(port, () => {
  console.log(`Server running on port ${port}.`);
});
