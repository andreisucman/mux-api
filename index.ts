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
import copyTask from "routes/copyTask.js";
import rootRoute from "routes/rootRoute.js";
import getExistingFilters from "routes/getExistingFilters.js";
import getReviews from "routes/getReviews.js";
import getRewards from "routes/getRewards.js";
import createBillingPortalSession from "routes/createBillingPortalSession.js";
import createCheckoutSession from "routes/createCheckoutSession.js";
import createConnectAccount from "routes/createConnectAccount.js";
import claimReward from "routes/claimReward.js";
import createRecipe from "routes/createRecipe.js";
import getCalendarTasks from "routes/getCalendarTasks.js";
import checkAnalysisCompletion from "routes/checkAnalysisCompletion.js";
import getProofRecord from "routes/getProofRecord.js";
import getTaskInfo from "routes/getTaskInfo.js";
import editTaskInstance from "routes/editTaskInstance.js";
import getInactiveTasks from "routes/getInactiveTasks.js";
import getAutocomplete from "routes/getAutocomplete.js";
import getProof from "routes/getProof.js";
import startProgressAnalysis from "routes/startProgressAnalysis.js";
import uploadProgress from "routes/uploadProgress.js";
import uploadToSpaces from "routes/uploadToSpaces.js";
import getRoutines from "routes/getRoutines.js";
import getUserData from "routes/getUserData.js";
import joinClub from "routes/joinClub.js";
import leaveClub from "routes/leaveClub.js";
import redirectToWallet from "routes/redirectToWallet.js";
import copyRoutine from "routes/copyRoutine.js";
import saveTaskFromDescription from "routes/saveTaskFromDescription.js";
import updateAccountDeletion from "routes/updateAccountDeletion.js";
import updateUserData from "routes/updateUserData.js";
import updateContentBlurType from "routes/updateContentBlurType.js";
import updateProofUpload from "routes/updateProofUpload.js";
import updateSpecialConsiderations from "routes/updateRoutineSuggestion.js";
import updateStatusOfTaskInstance from "routes/updateStatusOfTaskInstance.js";
import uploadProof from "routes/uploadProof.js";
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
import getProgress from "routes/getProgress.js";
import getFilters from "routes/getFilters.js";
import checkCountry from "routes/checkCountry.js";
import getDiary from "routes/getDiary.js";
import createDiaryRecord from "routes/createDiaryRecord.js";
import saveDiaryRecord from "routes/saveDiaryRecord.js";
import transcribe from "routes/transcribe.js";
import deleteContent from "routes/deleteContent.js";
import changeCountry from "routes/changeCountry.js";
import copyTaskInstance from "routes/copyTaskInstance.js";
import signOut from "routes/signOut.js";
import getRoutineData from "routes/getRoutineData.js";
import changeRoutineDataStatus from "routes/changeRoutineDataStatus.js";
import getPublicUserData from "routes/getPublicUserData.js";
import createTaskFromDescription from "routes/createTaskFromDescription.js";
import updateTaskExamples from "routes/updateTaskExamples.js";
import updateRoutineStatus from "routes/updateRoutineStatus.js";
import rescheduleRoutine from "routes/rescheduleRoutine.js";
import rescheduleTask from "routes/rescheduleTask.js";
import createRoutine from "routes/createRoutine.js";
import createRoutineCheckoutSession from "routes/createRoutineCheckoutSession.js";
import deleteTaskInstance from "routes/deleteTaskInstance.js";
import deleteRoutines from "routes/deleteRoutines.js";
import deleteTask from "routes/deleteTask.js";
import updateStatusOfTask from "routes/updateStatusOfTask.js";
import rescheduleTaskInstance from "routes/rescheduleTaskInstance.js";
import deleteToAnalyze from "routes/deleteToAnalyze.js";
import getConcerns from "routes/getConcerns.js";
import getIsFromEu from "routes/getIsFromEu.js";
import submitFeedback from "routes/submitFeedback.js";
import getTasks from "routes/getTasks.js";
import addExampleYoutubeVideo from "routes/addExampleYoutubeVideo.js";
import findExamples from "routes/findExamples.js";
import getRoutineSuggestion from "routes/getRoutineSuggestion.js";
import updateRoutineSuggestion from "routes/updateRoutineSuggestion.js";
import startRoutineSuggestionStream from "routes/startRoutineSuggestionStream/index.js";
import resumeRoutineSuggestionStream from "routes/resumeRoutineSuggestionStream.js";
import changeMonetizationStatus from "routes/changeMonetizationStatus.js";
import getViews from "routes/getViews.js";

import { client } from "init.js";

client.connect();

const app = express();
app.set("trust proxy", 1);
app.use(logCapturer);
app.use(metricCapturer);

const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS?.split(","),
  methods: ["GET", "POST", "OPTIONS", "HEAD"],
  allowedHeaders: [
    "Content-Type",
    "Timezone",
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

app.use("/stripeWebhook", stripeWebhook);
app.use("/connectWebhook", connectWebhook);

app.use(cookieParser());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

app.use("*", setHeaders);

app.use(limiter);

app.use("/", rootRoute);
app.use("/getIsFromEu", getIsFromEu);

app.use(timeout("2m"));
app.use("/metrics", metrics);

app.use("/sendPasswordResetEmail", sendPasswordResetEmail);
app.use("/setPassword", setPassword);
app.use("/getConcerns", getConcerns);

app.use((req, res, next) => checkAccess(req, res, next, true));
app.use("/authorize", authorize);
app.use("/authenticate", authenticate);
app.use("/createRoutineCheckoutSession", createRoutineCheckoutSession);
app.use("/getPublicUserData", getPublicUserData);
app.use("/getRoutines", getRoutines);
app.use("/getProof", getProof);
app.use("/getProgress", getProgress);
app.use("/getDiary", getDiary);
app.use("/updateTaskExamples", updateTaskExamples);
app.use("/verifyEmail", verifyEmail);
app.use("/changeEmailStepOne", changeEmailStepOne);
app.use("/changeEmailStepTwo", changeEmailStepTwo);
app.use("/startTheFlow", startTheFlow);
app.use("/checkAnalysisCompletion", checkAnalysisCompletion);
app.use("/getBeforeAfters", getBeforeAfters);
app.use("/getExistingFilters", getExistingFilters);
app.use("/getReviews", getReviews);
app.use("/getRewards", getRewards);
app.use("/getBeforeAfters", getBeforeAfters);
app.use("/getAutocomplete", getAutocomplete);
app.use("/startProgressAnalysis", startProgressAnalysis);
app.use("/startTheFlow", startTheFlow);
app.use("/uploadProgress", uploadProgress);
app.use("/uploadToSpaces", uploadToSpaces);
app.use("/getFilters", getFilters);
app.use("/deleteToAnalyze", deleteToAnalyze);

// protected routes
app.use((req, res, next) => checkAccess(req, res, next, false));
app.use("/createRoutine", createRoutine);
app.use("/getViews", getViews);
app.use("/updateRoutineSuggestion", updateRoutineSuggestion);
app.use("/startRoutineSuggestionStream", startRoutineSuggestionStream);
app.use("/resumeRoutineSuggestionStream", resumeRoutineSuggestionStream);
app.use("/getRoutineSuggestion", getRoutineSuggestion);
app.use("/findExamples", findExamples);
app.use("/addExampleYoutubeVideo", addExampleYoutubeVideo);
app.use("/getUserData", getUserData);
app.use("/getTasks", getTasks);
app.use("/submitFeedback", submitFeedback);
app.use("/deleteTask", deleteTask);
app.use("/updateStatusOfTask", updateStatusOfTask);
app.use("/rescheduleTaskInstance", rescheduleTaskInstance);
app.use("/rescheduleTask", rescheduleTask);
app.use("/deleteTaskInstance", deleteTaskInstance);
app.use("/deleteRoutines", deleteRoutines);
app.use("/getRoutineData", getRoutineData);
app.use("/changeRoutineDataStatus", changeRoutineDataStatus);
app.use("/changeMonetizationStatus", changeMonetizationStatus);
app.use("/deleteContent", deleteContent);
app.use("/copyTaskInstance", copyTaskInstance);
app.use("/changeCountry", changeCountry);
app.use("/saveDiaryRecord", saveDiaryRecord);
app.use("/createDiaryRecord", createDiaryRecord);
app.use("/checkCountry", checkCountry);
app.use("/sendConfirmationCode", sendConfirmationCode);
app.use("/copyTask", copyTask);
app.use("/createBillingPortalSession", createBillingPortalSession);
app.use("/createCheckoutSession", createCheckoutSession);
app.use("/createConnectAccount", createConnectAccount);
app.use("/claimReward", claimReward);
app.use("/createRecipe", createRecipe);
app.use("/getCalendarTasks", getCalendarTasks);
app.use("/getInactiveTasks", getInactiveTasks);
app.use("/getProofRecord", getProofRecord);
app.use("/getTaskInfo", getTaskInfo);
app.use("/editTaskInstance", editTaskInstance);
app.use("/getCalendarTasks", getCalendarTasks);
app.use("/joinClub", joinClub);
app.use("/leaveClub", leaveClub);
app.use("/redirectToWallet", redirectToWallet);
app.use("/copyRoutine", copyRoutine);
app.use("/saveTaskFromDescription", saveTaskFromDescription);
app.use("/createTaskFromDescription", createTaskFromDescription);
app.use("/updateAccountDeletion", updateAccountDeletion);
app.use("/updateUserData", updateUserData);
app.use("/updateContentBlurType", updateContentBlurType);
app.use("/updateProofUpload", updateProofUpload);
app.use("/updateSpecialConsiderations", updateSpecialConsiderations);
app.use("/updateStatusOfTaskInstance", updateStatusOfTaskInstance);
app.use("/uploadProof", uploadProof);
app.use("/signOut", signOut);
app.use("/transcribe", transcribe);
app.use("/rescheduleRoutine", rescheduleRoutine);
app.use("/updateRoutineStatus", updateRoutineStatus);

app.use(errorHandler);

const port = process.env.PORT || 3001;
const httpServer = http.createServer(app);
httpServer.listen(port, () => {
  console.log(`Server running on port ${port}.`);
});
