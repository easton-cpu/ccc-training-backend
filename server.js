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

const SALES_TRAINER_PROMPT = `
You are CCC AI, a roofing sales trainer for Connolly Construction Company.

CRITICAL RULES:

1. ALWAYS give SHORT, DIRECT, SCRIPT-BASED answers.
2. NEVER write long paragraphs unless asked.
3. ALWAYS tell the rep EXACTLY what to say.
4. Format answers like this:

Step 1:
Say: "exact words"

Step 2:
Say: "exact words"

Step 3:
Say: "exact words"

5. Speak like a top 1% roofing closer.
6. Use confident, controlled language.
7. Do not be weak, needy, or overly polite.
8. Do not be pushy in a way that damages trust.
9. Use CCC language: "At CCC, we..."

If uploaded CCC training content exists:
- Use it directly.
- Do not summarize it into broad theory.
- Turn it into scripts, steps, roleplay, or manager coaching.

If the uploaded content is weak or incomplete:
- Still give the strongest practical answer possible.
- Then add a short "Training Gap" note at the end.

If roleplaying:
- Act like a realistic homeowner.
- Push back hard.
- Wait for the rep response.
- Then score and coach them.

Goal:
Make a new roofing sales rep able to say the answer inside a homeowner's house.
`;

app.get("/", (req, res) => {
  res.json({ status: "CCC Learning Library backend is running." });
});

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

app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded." });
    }

    const uploadedFile = await openai.files.create({
      file: fs.createReadStream(req.file.path),
      purpose: "assistants"
    });

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

app.get("/ask-page", (req, res) => {
  res.send(`
    <h2>Ask CCC AI</h2>
    <form action="/ask-browser" method="get">
      <input name="question" style="width:500px;" placeholder="Type your question..." />
      <button type="submit">Ask</button>
    </form>
  `);
});

app.get("/ask-browser", async (req, res) => {
  try {
    const question = req.query.question;

    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content: SALES_TRAINER_PROMPT
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
      ],
      tool_choice: "auto"
    });

    res.send(`
      <h2>Question:</h2>
      <p>${question}</p>
      <h2>CCC AI Answer:</h2>
      <p>${response.output_text}</p>
      <a href="/ask-page">Ask another question</a>
    `);
  } catch (err) {
    res.send(err.message);
  }
});

app.post("/ask", async (req, res) => {
  try {
    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content: SALES_TRAINER_PROMPT
        },
        {
          role: "user",
          content: req.body.question
        }
      ],
      tools: [
        {
          type: "file_search",
          vector_store_ids: [process.env.VECTOR_STORE_ID]
        }
      ],
      tool_choice: "auto"
    });

    res.json({ answer: response.output_text });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(3000, () => {
  console.log("🚀 CCC server running on http://localhost:3000");
});
