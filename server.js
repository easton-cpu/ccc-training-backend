// SAME IMPORTS
import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();
const upload = multer({ dest: "uploads/" });
const audioUpload = multer({ dest: "audio_uploads/" });

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

app.use(cors());
app.use(express.json());

/* ===============================
   ROLEPLAY FLOW (APPOINTMENT)
================================ */

const ROLEPLAY_STEPS = [
  "opening",
  "inspection",
  "presentation",
  "price objection",
  "closing"
];

const sessions = {}; // simple in-memory tracking

/* ===============================
   START ROLEPLAY SESSION
================================ */

app.post("/start-full-roleplay", (req, res) => {
  const sessionId = Date.now().toString();

  sessions[sessionId] = {
    stepIndex: 0,
    totalScore: 0,
    history: []
  };

  res.json({
    sessionId,
    step: ROLEPLAY_STEPS[0],
    message: "Homeowner: So what are you seeing with the roof so far?"
  });
});

/* ===============================
   VOICE RESPONSE + SCORING
================================ */

app.post("/submit-roleplay-audio", audioUpload.single("audio"), async (req, res) => {
  try {
    const { sessionId } = req.body;
    const session = sessions[sessionId];

    if (!session) {
      return res.status(400).json({ error: "Invalid session" });
    }

    const currentStep = ROLEPLAY_STEPS[session.stepIndex];

    // TRANSCRIBE AUDIO
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(req.file.path),
      model: "gpt-4o-mini-transcribe"
    });

    const transcript = transcription.text;

    // SCORE RESPONSE
    const scoreResponse = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: `
You are CCC AI, a roofing sales manager scoring a rep.

Step: ${currentStep}

Rep said:
"${transcript}"

Score from 0–20.

Return:
Score: X/20
Feedback: short coaching
`
    });

    const scoreText = scoreResponse.output_text;

    const match = scoreText.match(/Score:\s*(\d+)/);
    const stepScore = match ? parseInt(match[1]) : 10;

    session.totalScore += stepScore;

    session.history.push({
      step: currentStep,
      transcript,
      score: stepScore
    });

    session.stepIndex++;

    fs.unlinkSync(req.file.path);

    // END CONDITION
    if (session.stepIndex >= ROLEPLAY_STEPS.length) {
      const finalScore = session.totalScore;

      return res.json({
        done: true,
        finalScore,
        pass: finalScore >= 80,
        message: finalScore >= 80
          ? "PASS — Ready to run appointments"
          : "FAIL — Needs more training"
      });
    }

    // NEXT STEP PROMPT
    const nextStep = ROLEPLAY_STEPS[session.stepIndex];

    const nextPrompt = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: `
You are a homeowner.

Next step: ${nextStep}

Give a realistic objection or response.
Keep it short.
`
    });

    res.json({
      done: false,
      transcript,
      stepScore,
      totalScore: session.totalScore,
      nextMessage: nextPrompt.output_text
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

/* ===============================
   BASIC SERVER
================================ */

app.get("/", (req, res) => {
  res.json({ status: "CCC server running" });
});

app.listen(3000, () => {
  console.log("🚀 CCC server running on http://localhost:3000");
});
