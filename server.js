import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();
const upload = multer({ dest: "uploads/" });

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

app.use(cors());
app.use(express.json());

/* ===============================
   BASIC HEALTH CHECK
=============================== */

app.get("/", (req, res) => {
  res.json({ status: "CCC Learning Library backend is running." });
});

/* ===============================
   UPLOAD TEST PAGE (FIXED)
=============================== */

app.get("/upload-test", (req, res) => {
  res.send(`
    <h2>CCC Upload Test</h2>
    <form action="/upload" method="post" enctype="multipart/form-data">
      <input type="text" name="title" placeholder="Document Title" /><br/><br/>

      <select name="category">
        <option value="sales">Sales</option>
        <option value="marketing">Marketing</option>
        <option value="production">Production</option>
        <option value="admin">Admin</option>
      </select><br/><br/>

      <input type="file" name="file" /><br/><br/>

      <button type="submit">Upload Into CCC Brain</button>
    </form>
  `);
});

/* ===============================
   FILE UPLOAD → VECTOR STORE
=============================== */

app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded." });
    }

    const uploadedFile = await openai.files.create({
      file: fs.createReadStream(req.file.path),
      purpose: "assistants"
    });

    await openai.vectorStores.files.createAndPoll(
      process.env.VECTOR_STORE_ID,
      { file_id: uploadedFile.id }
    );

    fs.unlinkSync(req.file.path);

    res.json({
      success: true,
      message: "File uploaded, indexed, and ready for CCC AI.",
      file_id: uploadedFile.id
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

/* ===============================
   ASK CCC AI (MAIN ENGINE)
=============================== */

app.post("/ask", async (req, res) => {
  try {
    const question = req.body.question;

    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content: `
You are CCC AI, the internal sales training coach.

RULES:
- Prioritize uploaded CCC documents ALWAYS
- Speak like a high-level roofing sales manager
- Use "At CCC, we..."
- Be direct, tactical, and real-world
- Give scripts, not theory

If docs are weak:
- Answer anyway
- Then suggest SOP improvements
`
        },
        {
          role: "user",
          content: question
        }
      ],
      tools: [
        {
          type: "file_search",
          vector_store_ids: [process.env.VECTOR_STORE_ID]
        }
      ]
    });

    res.json({
      answer: response.output_text
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ===============================
   ROLEPLAY + SCORING
=============================== */

app.post("/roleplay", async (req, res) => {
  try {
    const { scenario, repResponse } = req.body;

    // START ROLEPLAY
    if (!repResponse) {
      const response = await openai.responses.create({
        model: "gpt-4.1-mini",
        input: `
You are a homeowner in a roofing sales appointment.

Scenario: ${scenario}

Act realistic:
- Push back
- Be skeptical
- Do not be easy

Start the conversation.
`
      });

      return res.json({ reply: response.output_text });
    }

    // SCORE RESPONSE
    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: `
You are a roofing sales manager scoring a rep.

Scenario: ${scenario}

Rep said:
"${repResponse}"

Score out of 100 based on:
- Control
- Confidence
- Objection handling
- Closing direction

Respond EXACTLY like:

Score: __/100

What they did well:
- bullet points

What they did wrong:
- bullet points

Better response:
"script"
`
    });

    res.json({
      feedback: response.output_text
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ===============================
   FULL APPOINTMENT START
=============================== */

app.post("/start-full-roleplay", async (req, res) => {
  try {
    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: `
You are a homeowner.

Start a full roofing appointment.

Be realistic.
Do not make it easy.
`
    });

    res.json({
      sessionId: Date.now().toString(),
      step: "Opening",
      message: response.output_text
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ===============================
   VOICE SUBMISSION (TEMP TEXT SIM)
=============================== */

app.post("/submit-roleplay-audio", upload.single("audio"), async (req, res) => {
  try {
    // TEMP SIMULATION (voice processing comes next phase)
    const fakeTranscript = "Simulated transcript of rep response";

    const scoreResponse = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: `
Score this roofing sales response:

"${fakeTranscript}"

Score out of 20 for this step.
`
    });

    const stepScore = Math.floor(Math.random() * 20) + 1;
    const totalScore = Math.floor(Math.random() * 100);

    res.json({
      transcript: fakeTranscript,
      stepScore,
      totalScore,
      nextMessage: "Homeowner: Okay… but your price still seems high.",
      done: false
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ===============================
   START SERVER
=============================== */

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 CCC server running on port ${PORT}`);
});
