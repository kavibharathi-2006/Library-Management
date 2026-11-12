
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;
const MONGO_URI =
  process.env.MONGO_URI || "mongodb://127.0.0.1:27017/bookbridge";
const JWT_SECRET = process.env.JWT_SECRET;

// -------------------- CHECK ENVIRONMENT --------------------

if (!JWT_SECRET) {
  console.error("Error: Add JWT_SECRET to backend/.env");
  process.exit(1);
}

// -------------------- IMPORT MODELS --------------------

const User = require("./models/User");
const Book = require("./models/Book");
const Loan = require("./models/Loan");
const SeatBooking = require("./models/SeatBooking");
const Exchange = require("./models/Exchange");
const ActivityLog = require("./models/ActivityLog");

// -------------------- CONSTANTS --------------------

const VALID_SLOTS = [
  "09:00-11:00",
  "11:00-13:00",
  "13:00-15:00",
  "15:00-17:00"
];

// -------------------- HELPER FUNCTIONS --------------------

function safeUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role
  };
}

function validId(id) {
  return mongoose.isValidObjectId(id);
}

function isValidDateString(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

async function logActivity(userId, action, details = "") {
  try {
    await ActivityLog.create({
      user: userId || null,
      action,
      details
    });
  } catch (error) {
    console.error("Activity log error:", error.message);
  }
}

// -------------------- AUTHENTICATION MIDDLEWARE --------------------

function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ")
    ? header.slice(7)
    : "";

  if (!token) {
    return res.status(401).json({
      message: "Please log in first."
    });
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (error) {
    return res.status(401).json({
      message: "Session expired. Please log in again."
    });
  }
}

function librarianOnly(req, res, next) {
  if (req.user.role !== "librarian") {
    return res.status(403).json({
      message: "Librarian access required."
    });
  }

  next();
}

// -------------------- BASIC ROUTES --------------------

app.get("/", (req, res) => {
  res.json({
    message: "Welcome to BookBridge Library Management API."
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    server: "running",
    database:
      mongoose.connection.readyState === 1
        ? "connected"
        : "disconnected"
  });
});

// -------------------- STUDENT REGISTRATION --------------------

app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (
      typeof name !== "string" ||
      !name.trim() ||
      typeof email !== "string" ||
      !email.trim() ||
      typeof password !== "string" ||
      !password
    ) {
      return res.status(400).json({
        message: "Name, email and password are required."
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        message: "Password must be at least 8 characters."
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const existingUser = await User.findOne({
      email: normalizedEmail
    });

    if (existingUser) {
      return res.status(409).json({
        message: "Email already registered."
      });
    }

    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password: await bcrypt.hash(password, 12),
      role: "student"
    });

    await logActivity(user._id, "REGISTER", "Student registered");

    res.status(201).json({
      message: "Registration successful.",
      user: safeUser(user)
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        message: "Email already registered."
      });
    }

    console.error("Registration error:", error);

    res.status(500).json({
      message: "Registration failed."
    });
  }
});

// -------------------- LIBRARIAN REGISTRATION --------------------

// Librarian registration requires the private secret from .env.
app.post("/api/auth/register-librarian", async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      librarianSecret
    } = req.body;

    if (
      !process.env.LIBRARIAN_SECRET ||
      typeof librarianSecret !== "string" ||
      librarianSecret !== process.env.LIBRARIAN_SECRET
    ) {
      return res.status(403).json({
        message: "Invalid librarian registration secret."
      });
    }

    if (
      typeof name !== "string" ||
      !name.trim() ||
      typeof email !== "string" ||
      !email.trim() ||
      typeof password !== "string" ||
      password.length < 8
    ) {
      return res.status(400).json({
        message: "Name, email and password (at least 8 characters) are required."
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (await User.findOne({ email: normalizedEmail })) {
      return res.status(409).json({
        message: "Email already registered."
      });
    }

    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password: await bcrypt.hash(password, 12),
      role: "librarian"
    });

    await logActivity(
      user._id,
      "REGISTER",
      "Librarian account created"
    );

    res.status(201).json({
      message: "Librarian account created.",
      user: safeUser(user)
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        message: "Email already registered."
      });
    }

    console.error("Librarian registration error:", error);

    res.status(500).json({
      message: "Librarian registration failed."
    });
  }
});

// -------------------- LOGIN --------------------

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (
      typeof email !== "string" ||
      typeof password !== "string"
    ) {
      return res.status(400).json({
        message: "Email and password are required."
      });
    }

    const user = await User.findOne({
      email: email.trim().toLowerCase()
    });

    if (
      !user ||
      !(await bcrypt.compare(password, user.password))
    ) {
      return res.status(401).json({
        message: "Invalid email or password."
      });
    }

    const token = jwt.sign(
      {
        id: user._id.toString(),
        role: user.role,
        name: user.name
      },
      JWT_SECRET,
      { expiresIn: "1d" }
    );

    await logActivity(user._id, "LOGIN", "User logged in");

    res.json({
      message: "Login successful.",
      token,
      user: safeUser(user)
    });
  } catch (error) {
    console.error("Login error:", error);

    res.status(500).json({
      message: "Login failed."
    });
  }
});

// -------------------- CURRENT USER --------------------

app.get("/api/auth/me", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        message: "User not found."
      });
    }

    res.json({
      user: safeUser(user)
    });
  } catch (error) {
    res.status(500).json({
      message: "Could not retrieve user."
    });
  }
});

// -------------------- GET BOOKS / SEARCH --------------------

app.get("/api/books", auth, async (req, res) => {
  try {
    const search =
      typeof req.query.search === "string"
        ? req.query.search.trim().slice(0, 100)
        : "";

    const filter = search
      ? {
          $or: [
            { title: { $regex: search, $options: "i" } },
            { author: { $regex: search, $options: "i" } },
            { category: { $regex: search, $options: "i" } },
            { isbn: { $regex: search, $options: "i" } }
          ]
        }
      : {};

    const books = await Book.find(filter).sort({
      createdAt: -1
    });

    res.json({ books });
  } catch (error) {
    res.status(500).json({
      message: "Could not load books."
    });
  }
});

// -------------------- ADD BOOK --------------------

app.post("/api/books", auth, librarianOnly, async (req, res) => {
  try {
    const {
      title,
      author,
      category,
      isbn,
      rack,
      quantity
    } = req.body;

    if (
      typeof title !== "string" ||
      !title.trim() ||
      typeof author !== "string" ||
      !author.trim()
    ) {
      return res.status(400).json({
        message: "Title and author are required."
      });
    }

    const count = Number(quantity ?? 1);

    if (!Number.isInteger(count) || count < 0) {
      return res.status(400).json({
        message: "Quantity must be a non-negative whole number."
      });
    }

    const book = await Book.create({
      title: title.trim(),
      author: author.trim(),
      category:
        typeof category === "string" && category.trim()
          ? category.trim()
          : "General",
      isbn: typeof isbn === "string" ? isbn.trim() : "",
      rack:
        typeof rack === "string" && rack.trim()
          ? rack.trim()
          : "Not assigned",
      quantity: count,
      availableCopies: count
    });

    await logActivity(
      req.user.id,
      "BOOK_ADDED",
      book.title
    );

    res.status(201).json({
      message: "Book added successfully.",
      book
    });
  } catch (error) {
    console.error("Add book error:", error);

    res.status(500).json({
      message: "Could not add book."
    });
  }
});

// -------------------- UPDATE BOOK --------------------

app.put("/api/books/:id", auth, librarianOnly, async (req, res) => {
  try {
    if (!validId(req.params.id)) {
      return res.status(400).json({
        message: "Invalid book ID."
      });
    }

    const book = await Book.findById(req.params.id);

    if (!book) {
      return res.status(404).json({
        message: "Book not found."
      });
    }

    for (const field of ["title", "author", "category", "isbn", "rack"]) {
      if (req.body[field] !== undefined) {
        if (
          ["title", "author"].includes(field) &&
          (typeof req.body[field] !== "string" ||
            !req.body[field].trim())
        ) {
          return res.status(400).json({
            message: `${field} cannot be empty.`
          });
        }

        book[field] =
          typeof req.body[field] === "string"
            ? req.body[field].trim()
            : req.body[field];
      }
    }

    if (req.body.quantity !== undefined) {
      const count = Number(req.body.quantity);
      const issued = book.quantity - book.availableCopies;

      if (
        !Number.isInteger(count) ||
        count < 0 ||
        count < issued
      ) {
        return res.status(400).json({
          message:
            "Quantity cannot be less than the number of currently issued copies."
        });
      }

      book.quantity = count;
      book.availableCopies = count - issued;
    }

    await book.save();

    await logActivity(
      req.user.id,
      "BOOK_UPDATED",
      book.title
    );

    res.json({
      message: "Book updated successfully.",
      book
    });
  } catch (error) {
    console.error("Update book error:", error);

    res.status(500).json({
      message: "Could not update book."
    });
  }
});

// -------------------- DELETE BOOK --------------------

app.delete("/api/books/:id", auth, librarianOnly, async (req, res) => {
  try {
    if (!validId(req.params.id)) {
      return res.status(400).json({
        message: "Invalid book ID."
      });
    }

    const book = await Book.findById(req.params.id);

    if (!book) {
      return res.status(404).json({
        message: "Book not found."
      });
    }

    if (book.availableCopies !== book.quantity) {
      return res.status(409).json({
        message: "Return all issued copies before deleting this book."
      });
    }

    await Book.findByIdAndDelete(book._id);

    await logActivity(
      req.user.id,
      "BOOK_DELETED",
      book.title
    );

    res.json({
      message: "Book deleted successfully."
    });
  } catch (error) {
    res.status(500).json({
      message: "Could not delete book."
    });
  }
});

// -------------------- GET ONE BOOK / QR LOOKUP --------------------

app.get("/api/books/:id", auth, async (req, res) => {
  try {
    if (!validId(req.params.id)) {
      return res.status(400).json({
        message: "Invalid book ID."
      });
    }

    const book = await Book.findById(req.params.id);

    if (!book) {
      return res.status(404).json({
        message: "Book not found."
      });
    }

    res.json({ book });
  } catch (error) {
    res.status(500).json({
      message: "Could not retrieve book."
    });
  }
});

// -------------------- GET LOANS --------------------

app.get("/api/loans", auth, async (req, res) => {
  try {
    const filter =
      req.user.role === "librarian"
        ? {}
        : { student: req.user.id };

    const loans = await Loan.find(filter)
      .populate("book", "title author rack")
      .populate("student", "name email")
      .sort({ createdAt: -1 });

    res.json({ loans });
  } catch (error) {
    res.status(500).json({
      message: "Could not load loan records."
    });
  }
});

// -------------------- ISSUE BOOK --------------------

app.post("/api/loans/issue", auth, librarianOnly, async (req, res) => {
  try {
    const { bookId, studentEmail, dueDate } = req.body;

    if (
      !validId(bookId) ||
      typeof studentEmail !== "string" ||
      !studentEmail.trim() ||
      !isValidDateString(dueDate)
    ) {
      return res.status(400).json({
        message: "Valid book ID, student email and due date are required."
      });
    }

    const parsedDueDate = new Date(
      `${dueDate}T23:59:59.000Z`
    );

    const today = new Date().toISOString().slice(0, 10);

    if (dueDate <= today) {
      return res.status(400).json({
        message: "Choose a future due date."
      });
    }

    const student = await User.findOne({
      email: studentEmail.trim().toLowerCase(),
      role: "student"
    });

    if (!student) {
      return res.status(404).json({
        message: "Student account not found."
      });
    }

    const book = await Book.findOneAndUpdate(
      {
        _id: bookId,
        availableCopies: { $gt: 0 }
      },
      {
        $inc: { availableCopies: -1 }
      },
      { new: true }
    );

    if (!book) {
      return res.status(409).json({
        message: "Book unavailable or not found."
      });
    }

    try {
      const loan = await Loan.create({
        book: book._id,
        student: student._id,
        dueDate: parsedDueDate
      });

      await logActivity(
        req.user.id,
        "BOOK_ISSUED",
        `${book.title} to ${student.email}`
      );

      res.status(201).json({
        message: "Book issued successfully.",
        loan
      });
    } catch (error) {
      await Book.updateOne(
        { _id: book._id },
        { $inc: { availableCopies: 1 } }
      );

      throw error;
    }
  } catch (error) {
    console.error("Issue book error:", error);

    res.status(500).json({
      message: "Could not issue book."
    });
  }
});

// -------------------- RETURN BOOK --------------------

app.post("/api/loans/:id/return", auth, librarianOnly, async (req, res) => {
  try {
    if (!validId(req.params.id)) {
      return res.status(400).json({
        message: "Invalid loan ID."
      });
    }

    const loan = await Loan.findOneAndUpdate(
      {
        _id: req.params.id,
        status: "Issued"
      },
      {
        $set: {
          status: "Returned",
          returnDate: new Date()
        }
      },
      { new: true }
    ).populate("book", "title");

    if (!loan) {
      return res.status(404).json({
        message: "Active issue record not found."
      });
    }

    if (loan.book) {
      await Book.updateOne(
        { _id: loan.book._id },
        { $inc: { availableCopies: 1 } }
      );
    }

    await logActivity(
      req.user.id,
      "BOOK_RETURNED",
      loan.book?.title || "Book returned"
    );

    res.json({
      message: "Book returned successfully.",
      loan
    });
  } catch (error) {
    console.error("Return book error:", error);

    res.status(500).json({
      message: "Could not return book."
    });
  }
});

// -------------------- GET SEAT BOOKINGS --------------------

app.get("/api/seats", auth, async (req, res) => {
  try {
    const { date } = req.query;

    if (!isValidDateString(date)) {
      return res.status(400).json({
        message: "Choose a valid date in YYYY-MM-DD format."
      });
    }

    const bookings = await SeatBooking.find({
      date,
      status: "Booked"
    })
      .select("seatNumber slot student date status")
      .populate("student", "name email");

    res.json({
      totalSeats: 40,
      bookings
    });
  } catch (error) {
    res.status(500).json({
      message: "Could not load seat bookings."
    });
  }
});

// -------------------- BOOK A SEAT --------------------

app.post("/api/seats", auth, async (req, res) => {
  try {
    const { seatNumber, date, slot } = req.body;
    const seat = Number(seatNumber);

    if (
      !Number.isInteger(seat) ||
      seat < 1 ||
      seat > 40 ||
      !isValidDateString(date) ||
      !VALID_SLOTS.includes(slot)
    ) {
      return res.status(400).json({
        message: "Choose a valid seat, date and time slot."
      });
    }

    const today = new Date().toISOString().slice(0, 10);

    if (date < today) {
      return res.status(400).json({
        message: "Past-date bookings are not allowed."
      });
    }

    const booking = await SeatBooking.create({
      seatNumber: seat,
      student: req.user.id,
      date,
      slot,
      status: "Booked"
    });

    await logActivity(
      req.user.id,
      "SEAT_BOOKED",
      `Seat ${seat}, ${date}, ${slot}`
    );

    res.status(201).json({
      message: "Seat booked successfully.",
      booking
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        message: "This seat is already booked for that slot."
      });
    }

    console.error("Seat booking error:", error);

    res.status(500).json({
      message: "Could not book seat."
    });
  }
});

// -------------------- CANCEL SEAT BOOKING --------------------

app.post("/api/seats/:id/cancel", auth, async (req, res) => {
  try {
    if (!validId(req.params.id)) {
      return res.status(400).json({
        message: "Invalid booking ID."
      });
    }

    const filter = {
      _id: req.params.id,
      status: "Booked"
    };

    if (req.user.role !== "librarian") {
      filter.student = req.user.id;
    }

    const booking = await SeatBooking.findOneAndUpdate(
      filter,
      { $set: { status: "Cancelled" } },
      { new: true }
    );

    if (!booking) {
      return res.status(404).json({
        message: "Active booking not found."
      });
    }

    await logActivity(
      req.user.id,
      "SEAT_CANCELLED",
      `Seat ${booking.seatNumber}`
    );

    res.json({
      message: "Seat booking cancelled successfully."
    });
  } catch (error) {
    res.status(500).json({
      message: "Could not cancel seat booking."
    });
  }
});

// -------------------- MY SEAT BOOKINGS --------------------

app.get("/api/my-seats", auth, async (req, res) => {
  try {
    const filter =
      req.user.role === "librarian"
        ? {}
        : { student: req.user.id };

    const bookings = await SeatBooking.find(filter)
      .populate("student", "name email")
      .sort({ date: -1 });

    res.json({ bookings });
  } catch (error) {
    res.status(500).json({
      message: "Could not load your seat bookings."
    });
  }
});

// -------------------- GET EXCHANGE REQUESTS --------------------

app.get("/api/exchanges", auth, async (req, res) => {
  try {
    const filter =
      req.user.role === "librarian"
        ? {}
        : { requester: req.user.id };

    const exchanges = await Exchange.find(filter)
      .populate("book", "title author rack")
      .populate("requester", "name email")
      .sort({ createdAt: -1 });

    res.json({ exchanges });
  } catch (error) {
    res.status(500).json({
      message: "Could not load exchange requests."
    });
  }
});

// -------------------- CREATE EXCHANGE REQUEST --------------------

app.post("/api/exchanges", auth, async (req, res) => {
  try {
    const { bookId, message } = req.body;

    if (!validId(bookId)) {
      return res.status(400).json({
        message: "Select a valid book."
      });
    }

    const book = await Book.findById(bookId);

    if (!book) {
      return res.status(404).json({
        message: "Book not found."
      });
    }

    const exchange = await Exchange.create({
      book: book._id,
      requester: req.user.id,
      message:
        typeof message === "string"
          ? message.trim().slice(0, 1000)
          : ""
    });

    await logActivity(
      req.user.id,
      "EXCHANGE_REQUESTED",
      book.title
    );

    res.status(201).json({
      message: "Exchange request submitted.",
      exchange
    });
  } catch (error) {
    res.status(500).json({
      message: "Could not submit exchange request."
    });
  }
});

// -------------------- UPDATE EXCHANGE STATUS --------------------

app.patch("/api/exchanges/:id", auth, librarianOnly, async (req, res) => {
  try {
    if (!validId(req.params.id)) {
      return res.status(400).json({
        message: "Invalid request ID."
      });
    }

    const { status } = req.body;

    if (!["Accepted", "Rejected"].includes(status)) {
      return res.status(400).json({
        message: "Status must be Accepted or Rejected."
      });
    }

    const exchange = await Exchange.findByIdAndUpdate(
      req.params.id,
      { $set: { status } },
      { new: true, runValidators: true }
    )
      .populate("book", "title")
      .populate("requester", "name email");

    if (!exchange) {
      return res.status(404).json({
        message: "Exchange request not found."
      });
    }

    await logActivity(
      req.user.id,
      "EXCHANGE_UPDATED",
      `${exchange.status}: ${exchange.book?.title || "Book"}`
    );

    res.json({
      message: "Exchange status updated.",
      exchange
    });
  } catch (error) {
    res.status(500).json({
      message: "Could not update exchange status."
    });
  }
});

// -------------------- DASHBOARD STATISTICS --------------------

app.get("/api/dashboard", auth, async (req, res) => {
  try {
    const [
      totalBooks,
      availableResult,
      activeLoans,
      seatsToday
    ] = await Promise.all([
      Book.countDocuments(),

      Book.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: "$availableCopies" }
          }
        }
      ]),

      Loan.countDocuments(
        req.user.role === "librarian"
          ? { status: "Issued" }
          : {
              status: "Issued",
              student: req.user.id
            }
      ),

      SeatBooking.countDocuments({
        student: req.user.id,
        date: new Date().toISOString().slice(0, 10),
        status: "Booked"
      })
    ]);

    const stats = {
      totalBooks,
      availableCopies: availableResult[0]?.total || 0,
      activeLoans,
      seatsToday
    };

    if (req.user.role === "librarian") {
      const [
        students,
        pendingExchanges,
        overdueLoans
      ] = await Promise.all([
        User.countDocuments({ role: "student" }),

        Exchange.countDocuments({
          status: "Pending"
        }),

        Loan.countDocuments({
          status: "Issued",
          dueDate: { $lt: new Date() }
        })
      ]);

      stats.students = students;
      stats.pendingExchanges = pendingExchanges;
      stats.overdueLoans = overdueLoans;
    }

    res.json({ stats });
  } catch (error) {
    console.error("Dashboard error:", error);

    res.status(500).json({
      message: "Could not load dashboard."
    });
  }
});

// -------------------- ACTIVITY LOGS --------------------

app.get("/api/logs", auth, librarianOnly, async (req, res) => {
  try {
    const logs = await ActivityLog.find()
      .populate("user", "name email role")
      .sort({ createdAt: -1 })
      .limit(200);

    res.json({ logs });
  } catch (error) {
    res.status(500).json({
      message: "Could not load activity logs."
    });
  }
});

// -------------------- HANDLE UNKNOWN ROUTES --------------------

app.use((req, res) => {
  res.status(404).json({
    message: `Route not found: ${req.method} ${req.originalUrl}`
  });
});

// -------------------- GLOBAL ERROR HANDLER --------------------

app.use((error, req, res, next) => {
  console.error("Server error:", error);

  if (res.headersSent) {
    return next(error);
  }

  res.status(500).json({
    message: "An unexpected server error occurred."
  });
});

// -------------------- START SERVER --------------------

async function startServer() {
  try {
    console.log("Connecting to MongoDB...");

    await mongoose.connect(MONGO_URI);

    console.log("MongoDB connected successfully!");
    console.log(`Database: ${mongoose.connection.name}`);

    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/api/health`);
    });
  } catch (error) {
    console.error("Startup failed:", error.message);
    process.exit(1);
  }
}

startServer();
