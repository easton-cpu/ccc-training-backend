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
   SYSTEM PROMPT (SALES TRAINER)
================================ */
const SALES_TRAINER_PROMPT = `
You are CCC AI, a roofing sales trainer for Connolly Construction Company.

CRITICAL RULES:

1. ALWAYS give SHORT, DIRECT, SCRIPT-BASED answers.
2. NEVER write long paragraphs unless asked.
3. ALWAYS tell the rep EXACTLY what to say.

FORMAT:
Step 1:
Say: "..."

Step 2:
Say: "..."

4. Speak like a top 1% roofing closer.
5. Use confident, controlled language.
6. Use CCC language: "At CCC, we..."

7. Use uploaded training documents FIRST.
8. Do NOT give generic advice.
9. Turn answers into scripts.

Goal:
Make reps able to say it in a real home.
`;

/* ===============================
   ROOT
================================ */
app.get("/", (req, res) => {
  res.json({ status: "CCC Learning Library backend is running." });
});

/* ===============================
   UPLOAD TEST PAGE
================================ */
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
   UPLOAD + INDEX FILE
================================ */
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded." });
    }

    const uploadedFile = await openai.files.create({
      file: fs.createReadStream(req.file.path),
      purpose: "assistants"
    });

    // WAIT until indexing completes
    await openai.vectorStores.files.createAndPoll(process.env.VECTOR_STORE_ID, {
      file_id: uploadedFile.id
    });

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
   ASK PAGE (BROWSER TEST)
================================ */
app.get("/ask-page", (req, res) => {
  res.send(`
    <h2>Ask CCC AI</h2>
    <form action="/ask-browser" method="get">
      <input name="question" style="width:500px;" placeholder="Ask a question..." />
      <button type="submit">Ask</button>
    </form>
  `);
});

/* ===============================
   ASK (BROWSER)
================================ */
app.get("/ask-browser", async (req, res) => {
  try {
    const question = req.query.question;

    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: [
        { role: "system", content: SALES_TRAINER_PROMPT },
        { role: "user", content: question }
      ],
      tools: [
        {
          type: "file_search",
          vector_store_ids: [process.env.VECTOR_STORE_ID]
        }
      ]
    });

    res.send(`
      <h2>Question:</h2>
      <p>${question}</p>
      <h2>CCC AI Answer:</h2>
      <pre>${response.output_text}</pre>
      <a href="/ask-page">Ask another</a>
    `);

  } catch (err) {
    res.send(err.message);
  }
});

/* ===============================
   ASK (API)
================================ */
app.post("/ask", async (req, res) => {
  try {
    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: [
        { role: "system", content: SALES_TRAINER_PROMPT },
        { role: "user", content: req.body.question }
      ],
      tools: [
        {
          type: "file_search",
          vector_store_ids: [process.env.VECTOR_STORE_ID]
        }
      ]
    });

    res.json({ answer: response.output_text });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ===============================
   ROLEPLAY + SCORING
================================ */
app.post("/roleplay", async (req, res) => {
  try {
    const { scenario, repResponse } = req.body;

    // Start roleplay (AI homeowner)
    if (!repResponse) {
      const start = await openai.responses.create({
        model: "gpt-4.1-mini",
        input: `
You are a homeowner in a roofing sales appointment.

Scenario: ${scenario || "price objection"}

You are skeptical, realistic, and resistant.

Respond with ONE objection in 1-2 sentences.
`
      });

      return res.json({ reply: start.output_text });
    }

    // Score rep
    const score = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: `
You are CCC AI, a high-level roofing sales manager.

Scenario: ${scenario}

Rep said:
"${repResponse}"

Score 1-10 on:
- Control
- Confidence
- Objection handling
- Value framing
- Closing attempt

Return:

Score: X/10

What they did well:
- ...

What they missed:
- ...

Better response:
Say: "..."

Manager note:
...
`
    });

    res.json({ feedback: score.output_text });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ===============================
   START SERVER
================================ */
app.listen(3000, () => {
  console.log("🚀 CCC server running on http://localhost:3000");
});
