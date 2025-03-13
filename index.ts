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
import checkAccess from "middleware/checkAccess.js";
import getBeforeAfters from "routes/getBeforeAfters.js";
import startTheFlow from "routes/startTheFlow.js";
import stealTask from "routes/stealTask.js";
import analyzeFood from "routes/analyzeFood.js";
import rootRoute from "routes/rootRoute.js";
import getYouFollow from "routes/getYouFollow.js";
import getExistingFilters from "routes/getExistingFilters.js";
import getReviews from "routes/getReviews.js";
import getRewards from "routes/getRewards.js";
import checkVideoBlurStatus from "routes/checkVideoBlurStatus.js";
import createTaskFromDescription from "routes/createTaskFromDescription.js";
import createBillingPortalSession from "routes/createBillingPortalSession.js";
import createCheckoutSession from "routes/createCheckoutSession.js";
import createConnectAccount from "routes/createConnectAccount.js";
import claimReward from "routes/claimReward.js";
import createRecipe from "routes/createRecipe.js";
import getCalendarTasks from "routes/getCalendarTasks.js";
import getPurchases from "routes/getPurchases.js";
import checkAnalysisCompletion from "routes/checkAnalysisCompletion.js";
import getFollowHistory from "routes/getFollowHistory.js";
import getProofRecord from "routes/getProofRecord.js";
import getTaskInfo from "routes/getTaskInfo.js";
import editTask from "routes/editTask.js";
import getInactiveTasks from "@/routes/getInactiveTasks.js";
import getAutocomplete from "routes/getAutocomplete.js";
import getUsersProofRecords from "routes/getUsersProofRecords.js";
import startProgressAnalysis from "routes/startProgressAnalysis.js";
import startSubscriptionTrial from "routes/startSubscriptionTrial.js";
import uploadProgress from "routes/uploadProgress.js";
import uploadToSpaces from "routes/uploadToSpaces.js";
import getTasksProducts from "routes/getTasksProducts.js";
import getRoutines from "routes/getRoutines.js";
import getUserData from "routes/getUserData.js";
import joinClub from "routes/joinClub.js";
import updateConcernStatus from "routes/updateConcernStatus.js";
import leaveClub from "routes/leaveClub.js";
import redirectToWallet from "routes/redirectToWallet.js";
import stealRoutines from "@/routes/stealRoutines.js";
import saveFaqAnswer from "routes/saveFaqAnswer.js";
import skipAboutQuestion from "routes/skipAboutQuestion.js";
import getAboutQuestions from "routes/getAboutQuestions.js";
import saveTaskFromDescription from "routes/saveTaskFromDescription.js";
import followUser from "routes/followUser.js";
import updateAccountDeletion from "routes/updateAccountDeletion.js";
import updateUserData from "@/routes/updateUserData.js";
import updateSex from "routes/updateSex.js";
import updateClubPrivacy from "routes/updateClubPrivacy.js";
import updateContentBlurType from "routes/updateContentBlurType.js";
import updateProofUpload from "routes/updateProofUpload.js";
import updateSpecialConsiderations from "routes/updateSpecialConsiderations.js";
import updateStatusOfTasks from "routes/updateStatusOfTasks.js";
import uploadProof from "routes/uploadProof.js";
import withdrawReward from "routes/withdrawReward.js";
import metricCapturer from "middleware/metricCapturer.js";
import metrics from "routes/metrics.js";
import logCapturer from "middleware/logCapturer.js";
import errorHandler from "middleware/errorHandler.js";
import sendPasswordResetEmail from "routes/sendPasswordResetEmail.js";
import setPassword from "routes/setPassword.js";
import changeEmailStepOne from "routes/changeEmailStepOne.js";
import changeEmailStepTwo from "routes/changeEmailStepTwo.js";
import verifyEmail from "routes/verifyEmail.js";
import sendConfirmationCode from "routes/sendConfirmationCode.js";
import getAllProofRecords from "routes/getAllProofRecords.js";
import getUsersProgressRecords from "routes/getUsersProgressRecords.js";
import getAllSolutions from "routes/getAllSolutions.js";
import getFilters from "@/routes/getFilters.js";
import createRoutine from "routes/createRoutine.js";
import checkCountry from "routes/checkCountry.js";
import getDiaryRecords from "routes/getDiaryRecords.js";
import createDiaryRecord from "routes/createDiaryRecord.js";
import getLatestFoodAnalysis from "routes/getLatestFoodAnalysis.js";
import saveDiaryRecord from "routes/saveDiaryRecord.js";
import transcribe from "routes/transcribe.js";
import deleteContent from "routes/deleteContent.js";
import changeCountry from "routes/changeCountry.js";
import cloneTask from "routes/cloneTask.js";
import signOut from "routes/signOut.js";
import activateRoutine from "routes/activateRoutine.js";
import getScoresAndFeedback from "routes/getScoresAndFeedback.js";

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
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

app.use("*", setHeaders);

app.use(limiter);

app.use("/", rootRoute);

app.use(timeout("2m"));
app.use("/metrics", metrics);

app.use("/sendPasswordResetEmail", sendPasswordResetEmail);
app.use("/setPassword", setPassword);
app.use("/authorize", authorize);
app.use("/authenticate", authenticate);
app.use("/getAllSolutions", getAllSolutions);
app.use("/getLatestFoodAnalysis", getLatestFoodAnalysis);

app.use((req, res, next) => checkAccess(req, res, next, false));
app.use("/getRoutines", getRoutines);
app.use("/verifyEmail", verifyEmail);
app.use("/changeEmailStepOne", changeEmailStepOne);
app.use("/changeEmailStepTwo", changeEmailStepTwo);

app.use("/startTheFlow", startTheFlow);
app.use("/analyzeFood", analyzeFood);
app.use("/checkAnalysisCompletion", checkAnalysisCompletion);
app.use("/getBeforeAfters", getBeforeAfters);
app.use("/getYouFollow", getYouFollow);
app.use("/getExistingFilters", getExistingFilters);
app.use("/getReviews", getReviews);
app.use("/getRewards", getRewards);
app.use("/getBeforeAfters", getBeforeAfters);
app.use("/getAutocomplete", getAutocomplete);
app.use("/getUsersProofRecords", getUsersProofRecords);
app.use("/startProgressAnalysis", startProgressAnalysis);
app.use("/startSubscriptionTrial", startSubscriptionTrial);
app.use("/startTheFlow", startTheFlow);
app.use("/uploadProgress", uploadProgress);
app.use("/uploadToSpaces", uploadToSpaces);
app.use("/updateSex", updateSex);
app.use("/getAllProofRecords", getAllProofRecords);

// protected routes
app.use((req, res, next) => checkAccess(req, res, next, true));
app.use("/getScoresAndFeedback", getScoresAndFeedback);
app.use("/activateRoutine", activateRoutine);
app.use("/deleteContent", deleteContent);
app.use("/cloneTask", cloneTask);
app.use("/updateConcernStatus", updateConcernStatus);
app.use("/getAboutQuestions", getAboutQuestions);
app.use("/skipAboutQuestion", skipAboutQuestion);
app.use("/changeCountry", changeCountry);
app.use("/saveDiaryRecord", saveDiaryRecord);
app.use("/createDiaryRecord", createDiaryRecord);
app.use("/getDiaryRecords", getDiaryRecords);
app.use("/checkCountry", checkCountry);
app.use("/createRoutine", createRoutine);
app.use("/getFilters", getFilters);
app.use("/getUsersProgressRecords", getUsersProgressRecords);
app.use("/sendConfirmationCode", sendConfirmationCode);
app.use("/stealTask", stealTask);
app.use("/checkVideoBlurStatus", checkVideoBlurStatus);
app.use("/createTaskFromDescription", createTaskFromDescription);
app.use("/createBillingPortalSession", createBillingPortalSession);
app.use("/createCheckoutSession", createCheckoutSession);
app.use("/createConnectAccount", createConnectAccount);
app.use("/claimReward", claimReward);
app.use("/createRecipe", createRecipe);
app.use("/getCalendarTasks", getCalendarTasks);
app.use("/getPurchases", getPurchases);
app.use("/getInactiveTasks", getInactiveTasks);
app.use("/getFollowHistory", getFollowHistory);
app.use("/getProofRecord", getProofRecord);
app.use("/getTaskInfo", getTaskInfo);
app.use("/editTask", editTask);
app.use("/getCalendarTasks", getCalendarTasks);
app.use("/getTasksProducts", getTasksProducts);
app.use("/getUserData", getUserData);
app.use("/joinClub", joinClub);
app.use("/leaveClub", leaveClub);
app.use("/redirectToWallet", redirectToWallet);
app.use("/stealRoutines", stealRoutines);
app.use("/saveFaqAnswer", saveFaqAnswer);
app.use("/saveTaskFromDescription", saveTaskFromDescription);
app.use("/followUser", followUser);
app.use("/updateAccountDeletion", updateAccountDeletion);
app.use("/updateUserData", updateUserData);
app.use("/updateClubPrivacy", updateClubPrivacy);
app.use("/updateContentBlurType", updateContentBlurType);
app.use("/updateProofUpload", updateProofUpload);
app.use("/updateSpecialConsiderations", updateSpecialConsiderations);
app.use("/updateStatusOfTasks", updateStatusOfTasks);
app.use("/uploadProof", uploadProof);
app.use("/withdrawReward", withdrawReward);
app.use("/signOut", signOut);
app.use("/transcribe", transcribe);

app.use(errorHandler);

const port = process.env.PORT || 3001;
const httpServer = http.createServer(app);
httpServer.listen(port, () => {
  console.log(`Server running on port ${port}.`);
});
