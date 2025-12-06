const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
require("dotenv").config();

const app = express();

// Allow all origins in development, restrict in production
const allowedOrigins = [
  "https://onefeed-b06fd.web.app",
  "https://onefeed-b06fd.firebaseapp.com",
  "http://localhost:3000",
  "http://localhost:5000",
];

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);

      if (allowedOrigins.indexOf(origin) === -1) {
        const msg =
          "The CORS policy for this site does not allow access from the specified Origin.";
        return callback(new Error(msg), false);
      }
      return callback(null, true);
    },
    credentials: true,
  })
);

app.use(express.json());

// Initialize Firebase Admin from environment variables
admin.initializeApp({
  credential: admin.credential.cert({
    type: process.env.FIREBASE_TYPE,
    project_id: process.env.FIREBASE_PROJECT_ID,
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
    private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    client_id: process.env.FIREBASE_CLIENT_ID,
    auth_uri: process.env.FIREBASE_AUTH_URI,
    token_uri: process.env.FIREBASE_TOKEN_URI,
    auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_CERT_URL,
    client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL,
  }),
});

// Health check endpoint (required by Railway)
app.get("/", (req, res) => {
  res.json({
    message: "OneFeed Backend API",
    status: "running",
    timestamp: new Date().toISOString(),
    endpoints: ["/api/signup", "/api/verify", "/health"],
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    service: "onefeed-backend",
    timestamp: new Date().toISOString(),
  });
});

// User registration
app.post("/api/signup", async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: "Email and password are required",
      });
    }

    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: name || "",
      emailVerified: false,
    });

    // Create custom token for client
    const customToken = await admin.auth().createCustomToken(userRecord.uid);

    res.json({
      success: true,
      message: "User created successfully",
      user: {
        uid: userRecord.uid,
        email: userRecord.email,
        name: userRecord.displayName,
      },
      token: customToken,
    });
  } catch (error) {
    console.error("Signup error:", error);

    let errorMessage = "Registration failed";
    if (error.code === "auth/email-already-exists") {
      errorMessage = "Email already registered";
    } else if (error.code === "auth/invalid-email") {
      errorMessage = "Invalid email address";
    } else if (error.code === "auth/weak-password") {
      errorMessage = "Password should be at least 6 characters";
    }

    res.status(400).json({
      success: false,
      error: errorMessage,
      code: error.code,
    });
  }
});

// Verify token
app.post("/api/verify", async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        error: "Token is required",
      });
    }

    const decodedToken = await admin.auth().verifyIdToken(token);

    res.json({
      success: true,
      user: {
        uid: decodedToken.uid,
        email: decodedToken.email,
        name: decodedToken.name,
      },
    });
  } catch (error) {
    res.status(401).json({
      success: false,
      error: "Invalid or expired token",
    });
  }
});

// Get user info
app.get("/api/user/:uid", async (req, res) => {
  try {
    const userRecord = await admin.auth().getUser(req.params.uid);

    res.json({
      success: true,
      user: {
        uid: userRecord.uid,
        email: userRecord.email,
        name: userRecord.displayName,
        emailVerified: userRecord.emailVerified,
        createdAt: userRecord.metadata.creationTime,
      },
    });
  } catch (error) {
    res.status(404).json({
      success: false,
      error: "User not found",
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    error: "Something went wrong!",
    message: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({
    success: false,
    error: "Endpoint not found",
  });
});

// Railway provides PORT environment variable
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Backend server running on port ${PORT}`);
  console.log(`📡 Health check: http://localhost:${PORT}/health`);
  console.log(`🔗 API base: http://localhost:${PORT}/api`);
});
