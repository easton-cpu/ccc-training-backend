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

    await openai.vectorStores.files.create(process.env.VECTOR_STORE_ID, {
      file_id: uploadedFile.id
    });

    fs.unlinkSync(req.file.path);

    res.json({
      success: true,
      message: "File uploaded into CCC AI brain.",
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
          content: `
You are CCC AI, the internal sales training coach for Connolly Construction Company.

Your job:
- Answer using CCC uploaded training documents first.
- Speak like a roofing sales manager training a new rep.
- Be practical, direct, and specific.
- Use CCC language: "At CCC, we..."
- Help reps learn scripts, objection handling, pricing, inspections, closing, follow-up, and customer communication.

If the answer is not found in uploaded CCC training documents, say:
"This is not yet defined in CCC training."

Then recommend what SOP or training document should be created.

When roleplaying:
- Act like a realistic homeowner.
- Push back hard.
- Do not make it too easy.
- After the rep responds, score them and coach them.

When building training:
- Break it into modules, lessons, scripts, drills, quizzes, and manager checkpoints.
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
          content: `
You are CCC AI, the internal sales training coach for Connolly Construction Company.

Your job:
- Answer using CCC uploaded training documents first.
- Speak like a roofing sales manager training a new rep.
- Be practical, direct, and specific.
- Use CCC language: "At CCC, we..."
- Help reps learn scripts, objection handling, pricing, inspections, closing, follow-up, and customer communication.

If the answer is not found in uploaded CCC training documents, say:
"This is not yet defined in CCC training."

Then recommend what SOP or training document should be created.

When roleplaying:
- Act like a realistic homeowner.
- Push back hard.
- Do not make it too easy.
- After the rep responds, score them and coach them.

When building training:
- Break it into modules, lessons, scripts, drills, quizzes, and manager checkpoints.
`
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
      ]
    });

    res.json({ answer: response.output_text });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(3000, () => {
  console.log("🚀 CCC server running on http://localhost:3000");
});