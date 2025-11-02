const express = require('express');

const connectToDB = require("./config/dbConnect.js")

const { notFound, errorHandler } = require("./middlewares/errorMiddleware")

const { handleWebhook } = require('./controllers/paymentController');

const cors = require("cors")

const rateLimiting = require("express-rate-limit");

const helmet = require("helmet");

const hpp = require("hpp");

require('dotenv').config();

connectToDB()

const app = express()

app.set('trust proxy', 1);

app.use(cors({
    origin : "*"
}));

app.post('/webhook',express.raw({ type: 'application/json' }), handleWebhook);



app.use(express.json())
app.use(express.urlencoded({ extended: false }));


// Security Headers (helmet)
app.use(helmet());

// Prevent Http Param Pollution
app.use(hpp());

// Rate Limiting
app.use(rateLimiting({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max:200,
}));



//routes

app.use("/api/auth/",require("./routes/authRoutes.js"))

app.use("/api/users/",require("./routes/userRoutes.js"))

app.use("/api/courses/",require("./routes/courseRoutes.js"))

app.use("/api/lessons/",require("./routes/lessonRoutes.js"))

app.use("/api/chats/",require("./routes/chatRoutes.js"))

app.use("/api/quizzes/",require("./routes/quizRoutes.js"))

app.use("/api/questions/",require("./routes/questionRoutes.js"))

app.use("/api/enrollments/",require("./routes/enrollmentRoutes.js"))

app.use('/api/payments', require("./routes/paymentRoutes.js"));

app.use('/api/password', require('./routes/passwordRoutes.js'));



// Error handler middleware

app.use(notFound);
app.use(errorHandler);

const port = process.env.PORT || 8000;

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

