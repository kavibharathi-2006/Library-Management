import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { QRCodeCanvas } from "qrcode.react";
import { Html5QrcodeScanner } from "html5-qrcode";
import "bootstrap/dist/css/bootstrap.min.css";
import "./App.css";

const API = "http://localhost:5000/api";
const SLOTS = [
  "09:00-11:00",
  "11:00-13:00",
  "13:00-15:00",
  "15:00-17:00"
];
const today = new Date().toLocaleDateString("en-CA");

const client = axios.create({ baseURL: API });

client.interceptors.request.use(config => {
  const token = localStorage.getItem("bb_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Normalize API responses that contain arrays directly or inside objects.
function getArray(data, key) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.[key])) return data[key];
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

function QRScanner({ onScan, onClose }) {
  useEffect(() => {
    let scanner;

    try {
      scanner = new Html5QrcodeScanner(
        "bb-reader",
        { fps: 10, qrbox: { width: 220, height: 220 } },
        false
      );

      scanner.render(
        text => {
          scanner.clear().catch(() => {});
          onScan(text);
        },
        () => {}
      );
    } catch (error) {
      console.error("QR scanner error:", error);
    }

    return () => {
      if (scanner) scanner.clear().catch(() => {});
    };
  }, [onScan]);

  return (
    <div className="bb-panel">
      <h3>Scan book QR code</h3>
      <p>
        Allow camera permission. Camera scanning generally requires localhost
        or HTTPS.
      </p>
      <div id="bb-reader" />
      <button className="bb-btn secondary" onClick={onClose}>
        Close Scanner
      </button>
    </div>
  );
}

function LoginScreen({ onLogin }) {
  const [mode, setMode] = useState("login");
  const [role, setRole] = useState("student");
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    librarianSecret: ""
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");
    setBusy(true);

    try {
      let result;

      if (mode === "login") {
        result = await axios.post(`${API}/auth/login`, {
          email: form.email,
          password: form.password
        });
      } else if (role === "librarian") {
        result = await axios.post(
          `${API}/auth/register-librarian`,
          form
        );
      } else {
        result = await axios.post(`${API}/auth/register`, form);
      }

      if (mode === "register") {
        setMode("login");
        setError("Registration successful. Please log in.");
      } else {
        localStorage.setItem("bb_token", result.data.token);
        localStorage.setItem(
          "bb_user",
          JSON.stringify(result.data.user)
        );
        onLogin(result.data.user);
      }
    } catch (err) {
      setError(
        err.response?.data?.message ||
        "Could not connect to BookBridge API."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bb-auth">
      <div className="bb-auth-art">
        <span className="bb-brand-mark">B</span>
        <p className="bb-kicker">YOUR SMART DIGITAL LIBRARY</p>
        <h1>BookBridge</h1>
        <p>Discover books, find your seat, and share knowledge.</p>
        <div className="bb-auth-books">
          <span>READ</span>
          <span>EXPLORE</span>
          <span>SHARE</span>
        </div>
      </div>

      <form className="bb-auth-form" onSubmit={submit}>
        <p className="bb-kicker">
          {mode === "login" ? "WELCOME BACK" : "JOIN BOOKBRIDGE"}
        </p>

        <h2>
          {mode === "login"
            ? "Sign in to your library"
            : "Create an account"}
        </h2>

        <p className="bb-muted">
          {mode === "login"
            ? "Access your books and bookings."
            : "Student registration or authorised librarian setup."}
        </p>

        {mode === "register" && (
          <>
            <label>Account type</label>
            <select
              value={role}
              onChange={e => setRole(e.target.value)}
            >
              <option value="student">Student</option>
              <option value="librarian">
                Librarian (secret required)
              </option>
            </select>

            <label>Full name</label>
            <input
              required
              value={form.name}
              onChange={e =>
                setForm({ ...form, name: e.target.value })
              }
              placeholder="Your full name"
            />
          </>
        )}

        <label>Email address</label>
        <input
          required
          type="email"
          value={form.email}
          onChange={e =>
            setForm({ ...form, email: e.target.value })
          }
          placeholder="you@example.com"
        />

        <label>Password</label>
        <input
          required
          type="password"
          minLength="8"
          value={form.password}
          onChange={e =>
            setForm({ ...form, password: e.target.value })
          }
          placeholder="At least 8 characters"
        />

        {mode === "register" && role === "librarian" && (
          <>
            <label>Librarian registration secret</label>
            <input
              required
              type="password"
              value={form.librarianSecret}
              onChange={e =>
                setForm({
                  ...form,
                  librarianSecret: e.target.value
                })
              }
              placeholder="Private secret from .env"
            />
          </>
        )}

        {error && (
          <div className="alert alert-info py-2">{error}</div>
        )}

        <button className="bb-btn w-100" disabled={busy}>
          {busy
            ? "Please wait..."
            : mode === "login"
              ? "Login"
              : "Register"}
        </button>

        <p className="bb-switch">
          {mode === "login"
            ? "New to BookBridge?"
            : "Already registered?"}{" "}
          <button
            type="button"
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setError("");
            }}
          >
            {mode === "login" ? "Create account" : "Sign in"}
          </button>
        </p>
      </form>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("bb_user"));
    } catch {
      return null;
    }
  });

  const [tab, setTab] = useState("dashboard");
  const [books, setBooks] = useState([]);
  const [loans, setLoans] = useState([]);
  const [exchanges, setExchanges] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [seatData, setSeatData] = useState({
    totalSeats: 40,
    bookings: []
  });
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState({});
  const [search, setSearch] = useState("");
  const [date, setDate] = useState(today);
  const [slot, setSlot] = useState(SLOTS[0]);
  const [seat, setSeat] = useState(1);
  const [qrBook, setQrBook] = useState(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [showBookForm, setShowBookForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [bookForm, setBookForm] = useState({
    title: "",
    author: "",
    category: "General",
    isbn: "",
    rack: "",
    quantity: 1
  });

  const [issueForm, setIssueForm] = useState({
    bookId: "",
    studentEmail: "",
    dueDate: ""
  });

  const [exchangeForm, setExchangeForm] = useState({
    bookId: "",
    message: ""
  });

  const librarian = user?.role === "librarian";

  const logout = useCallback(() => {
    localStorage.removeItem("bb_token");
    localStorage.removeItem("bb_user");
    setUser(null);
    setTab("dashboard");
  }, []);

  const load = useCallback(async () => {
    if (!user) return;

    try {
      setError("");

      const requests = await Promise.all([
        client.get("/dashboard"),
        client.get("/books", {
          params: search.trim()
            ? { search: search.trim() }
            : {}
        }),
        client.get("/loans"),
        client.get("/exchanges"),
        client.get("/my-seats")
      ]);

      setStats(requests[0].data?.stats || {});

      // FIX: Handle both array responses and { books: [...] } responses.
      const bookData = requests[1].data;
      const loadedBooks = getArray(bookData, "books");

      setBooks(loadedBooks);

      setLoans(getArray(requests[2].data, "loans"));
      setExchanges(getArray(requests[3].data, "exchanges"));
      setBookings(getArray(requests[4].data, "bookings"));

      if (librarian) {
        const logResult = await client.get("/logs");
        setLogs(getArray(logResult.data, "logs"));
      }
    } catch (err) {
      if (err.response?.status === 401) {
        logout();
      } else {
        setError(
          err.response?.data?.message ||
          "Could not load data. Check backend."
        );
      }
    }
  }, [user, search, librarian, logout]);

  useEffect(() => {
    load();
  }, [load]);

  async function run(action, successText) {
    try {
      setMessage("");
      setError("");

      const result = await action();

      setMessage(
        successText ||
        result?.data?.message ||
        "Completed successfully."
      );

      await load();
      return result;
    } catch (err) {
      setError(
        err.response?.data?.message ||
        "Action failed. Please try again."
      );
      return null;
    }
  }

  async function saveBook(event) {
    event.preventDefault();

    const payload = {
      ...bookForm,
      quantity: Number(bookForm.quantity)
    };

    const result = await run(
      () =>
        editingId
          ? client.put(`/books/${editingId}`, payload)
          : client.post("/books", payload),
      editingId ? "Book updated." : "Book added."
    );

    if (result) {
      setShowBookForm(false);
      setEditingId(null);
      setBookForm({
        title: "",
        author: "",
        category: "General",
        isbn: "",
        rack: "",
        quantity: 1
      });
    }
  }

  async function deleteBook(book) {
    if (!window.confirm(`Delete "${book.title}"?`)) return;

    await run(
      () => client.delete(`/books/${book._id}`),
      "Book deleted."
    );
  }

  function startEdit(book) {
    setBookForm({
      title: book.title,
      author: book.author,
      category: book.category || "General",
      isbn: book.isbn || "",
      rack: book.rack || "",
      quantity: book.quantity
    });

    setEditingId(book._id);
    setShowBookForm(true);
  }

  const scanQR = useCallback(async value => {
    setScanOpen(false);

    try {
      const id = value.trim();
      const result = await client.get(
        `/books/${encodeURIComponent(id)}`
      );

      setScanResult(result.data.book);
      setError("");
    } catch {
      setScanResult(null);
      setError("Book not found. Please scan a BookBridge QR code.");
    }
  }, []);

  async function loadSeats() {
    try {
      const result = await client.get("/seats", {
        params: { date }
      });

      setSeatData({
        ...result.data,
        bookings: getArray(result.data, "bookings")
      });
    } catch (err) {
      setError(
        err.response?.data?.message ||
        "Could not load seats."
      );
    }
  }

  useEffect(() => {
    if (user && tab === "seats") {
      loadSeats();
    }
  }, [user, tab, date]);

  async function bookSeat(event) {
    event.preventDefault();

    const result = await run(
      () =>
        client.post("/seats", {
          seatNumber: Number(seat),
          date,
          slot
        }),
      "Seat booked."
    );

    if (result) await loadSeats();
  }

  async function issueBook(event) {
    event.preventDefault();

    const result = await run(
      () => client.post("/loans/issue", issueForm),
      "Book issued."
    );

    if (result) {
      setIssueForm({
        bookId: "",
        studentEmail: "",
        dueDate: ""
      });
    }
  }

  if (!user) {
    return <LoginScreen onLogin={setUser} />;
  }

  const navItems = [
    ["dashboard", "Dashboard"],
    ["books", "Book Library"],
    ["qr", "QR Book Locator"],
    ["exchange", "Book Exchange"],
    ["seats", "Seat Booking"],
    ["loans", librarian ? "Issue & Return" : "My Books"],
    ...(librarian ? [["logs", "Activity Logs"]] : [])
  ];

  return (
    <div className="bb-app">
      <aside className="bb-sidebar">
        <div className="bb-brand">
          <span className="bb-brand-mark">B</span>
          <span>
            BookBridge
            <small>SMART LIBRARY</small>
          </span>
        </div>

        <div className="bb-user">
          <div className="bb-avatar">
            {user.name?.charAt(0)?.toUpperCase()}
          </div>
          <div>
            <strong>{user.name}</strong>
            <small>{user.role}</small>
          </div>
        </div>

        <p className="bb-nav-label">WORKSPACE</p>

        {navItems.map(([id, label]) => (
          <button
            key={id}
            className={`bb-nav ${tab === id ? "active" : ""}`}
            onClick={() => setTab(id)}
          >
            <span>
              {({
                dashboard: "▦",
                books: "▤",
                qr: "▦",
                exchange: "⇄",
                seats: "▧",
                loans: "▣",
                logs: "☷"
              })[id]}
            </span>
            {label}
          </button>
        ))}

        <button className="bb-logout" onClick={logout}>
          ↪ Sign out
        </button>
      </aside>

      <main className="bb-main">
        <header className="bb-header">
          <div>
            <p className="bb-kicker">YOUR DIGITAL LIBRARY</p>
            <h1>
              {navItems.find(item => item[0] === tab)?.[1]}
            </h1>
          </div>

          <div className="bb-header-user">
            <span>Welcome, {user.name}</span>
            <div className="bb-avatar">
              {user.name?.charAt(0)?.toUpperCase()}
            </div>
          </div>
        </header>

        {message && (
          <div className="alert alert-success">
            {message}
            <button
              className="bb-dismiss"
              onClick={() => setMessage("")}
            >
              ×
            </button>
          </div>
        )}

        {error && (
          <div className="alert alert-danger">
            {error}
            <button
              className="bb-dismiss"
              onClick={() => setError("")}
            >
              ×
            </button>
          </div>
        )}

        {tab === "dashboard" && (
          <>
            <section className="bb-welcome">
              <div>
                <p className="bb-kicker">
                  BOOKS • KNOWLEDGE • COMMUNITY
                </p>
                <h2>
                  {librarian
                    ? "Your library at a glance."
                    : "Make today a reading day."}
                </h2>
                <p>
                  {librarian
                    ? "Manage books, readers, reservations and circulation."
                    : "Find a book, reserve a seat and manage your library activity."}
                </p>
                <button
                  className="bb-btn"
                  onClick={() => setTab("books")}
                >
                  Explore library →
                </button>
              </div>

              <div className="bb-welcome-art">
                <span>READ</span>
                <span>GROW</span>
                <span>SHARE</span>
              </div>
            </section>

            <div className="bb-stats">
              <div className="bb-stat">
                <span>Total book titles</span>
                <strong>{stats.totalBooks ?? 0}</strong>
                <small>In the collection</small>
              </div>

              <div className="bb-stat">
                <span>Available copies</span>
                <strong>{stats.availableCopies ?? 0}</strong>
                <small>Ready to issue</small>
              </div>

              <div className="bb-stat">
                <span>
                  {librarian ? "Active issues" : "My borrowed books"}
                </span>
                <strong>{stats.activeLoans ?? 0}</strong>
                <small>Currently issued</small>
              </div>

              <div className="bb-stat">
                <span>
                  {librarian ? "Pending exchanges" : "Today's seats"}
                </span>
                <strong>
                  {librarian
                    ? stats.pendingExchanges ?? 0
                    : stats.seatsToday ?? 0}
                </strong>
                <small>
                  {librarian
                    ? `${stats.overdueLoans ?? 0} overdue`
                    : "My reservations"}
                </small>
              </div>

              {librarian && (
                <div className="bb-stat">
                  <span>Students</span>
                  <strong>{stats.students ?? 0}</strong>
                  <small>Registered accounts</small>
                </div>
              )}
            </div>

            <section className="bb-panel">
              <div className="bb-panel-heading">
                <div>
                  <p className="bb-kicker">QUICK ACCESS</p>
                  <h3>What would you like to do?</h3>
                </div>
              </div>

              <div className="bb-quick-grid">
                {[
                  ["books", "▤", "Search books", "Explore the collection"],
                  ["qr", "▦", "QR book locator", "Scan or view book codes"],
                  ["exchange", "⇄", "Book exchange", "Share your reading"],
                  ["seats", "▧", "Reserve a seat", "Find a study space"],
                  [
                    "loans",
                    "▣",
                    librarian ? "Issue & return" : "My borrowed books",
                    "Track book circulation"
                  ]
                ].map(([id, icon, title, desc]) => (
                  <button
                    className="bb-quick"
                    key={id}
                    onClick={() => setTab(id)}
                  >
                    <span className="bb-quick-icon">{icon}</span>
                    <strong>{title}</strong>
                    <small>{desc}</small>
                  </button>
                ))}
              </div>
            </section>
          </>
        )}

        {tab === "books" && (
          <section className="bb-panel">
            <div className="bb-panel-heading">
              <div>
                <p className="bb-kicker">LIBRARY CATALOGUE</p>
                <h3>Find your next read</h3>
              </div>

              {librarian && (
                <button
                  className="bb-btn"
                  onClick={() => {
                    setEditingId(null);
                    setBookForm({
                      title: "",
                      author: "",
                      category: "General",
                      isbn: "",
                      rack: "",
                      quantity: 1
                    });
                    setShowBookForm(!showBookForm);
                  }}
                >
                  + Add book
                </button>
              )}
            </div>

            {librarian && showBookForm && (
              <form className="bb-form" onSubmit={saveBook}>
                <h4>{editingId ? "Edit book" : "Add a new book"}</h4>

                <div className="bb-form-grid">
                  <input
                    required
                    placeholder="Book title"
                    value={bookForm.title}
                    onChange={e =>
                      setBookForm({
                        ...bookForm,
                        title: e.target.value
                      })
                    }
                  />

                  <input
                    required
                    placeholder="Author"
                    value={bookForm.author}
                    onChange={e =>
                      setBookForm({
                        ...bookForm,
                        author: e.target.value
                      })
                    }
                  />

                  <input
                    placeholder="Category"
                    value={bookForm.category}
                    onChange={e =>
                      setBookForm({
                        ...bookForm,
                        category: e.target.value
                      })
                    }
                  />

                  <input
                    placeholder="ISBN"
                    value={bookForm.isbn}
                    onChange={e =>
                      setBookForm({
                        ...bookForm,
                        isbn: e.target.value
                      })
                    }
                  />

                  <input
                    placeholder="Rack / shelf"
                    value={bookForm.rack}
                    onChange={e =>
                      setBookForm({
                        ...bookForm,
                        rack: e.target.value
                      })
                    }
                  />

                  <input
                    required
                    type="number"
                    min="0"
                    placeholder="Quantity"
                    value={bookForm.quantity}
                    onChange={e =>
                      setBookForm({
                        ...bookForm,
                        quantity: e.target.value
                      })
                    }
                  />
                </div>

                <button className="bb-btn">
                  {editingId ? "Update book" : "Save book"}
                </button>

                <button
                  type="button"
                  className="bb-btn secondary ms-2"
                  onClick={() => setShowBookForm(false)}
                >
                  Cancel
                </button>
              </form>
            )}

            <form
              className="bb-search"
              onSubmit={e => {
                e.preventDefault();
                load();
              }}
            >
              <input
                placeholder="Search title, author, category or ISBN..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              <button className="bb-btn">Search</button>
            </form>

            <div className="bb-book-grid">
              {books.map(book => (
                <article className="bb-book-card" key={book._id}>
                  <div className="bb-cover">
                    <small>BOOKBRIDGE LIBRARY</small>
                    <strong>{book.title}</strong>
                    <span>{book.category}</span>
                  </div>

                  <div className="bb-book-info">
                    <h4>{book.title}</h4>
                    <p>by {book.author}</p>
                    <small>
                      Rack: {book.rack || "Not assigned"}
                    </small>

                    <div className="bb-availability">
                      {book.availableCopies ?? 0} of {book.quantity} available
                    </div>

                    <div className="bb-card-actions">
                      <button
                        className="bb-btn small"
                        onClick={() => setQrBook(book)}
                      >
                        Show QR
                      </button>

                      <button
                        className="bb-btn secondary small"
                        onClick={() => {
                          setExchangeForm({
                            bookId: book._id,
                            message: ""
                          });
                          setTab("exchange");
                        }}
                      >
                        Exchange
                      </button>

                      {librarian && (
                        <button
                          className="bb-btn secondary small"
                          onClick={() => startEdit(book)}
                        >
                          Edit
                        </button>
                      )}

                      {librarian && (
                        <button
                          className="bb-btn danger small"
                          onClick={() => deleteBook(book)}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>

            {books.length === 0 && (
              <p className="bb-empty">
                No books found.{" "}
                {librarian
                  ? "Add your first book above."
                  : "Ask your librarian to add books."}
              </p>
            )}
          </section>
        )}

        {tab === "qr" && (
          <section className="bb-panel">
            <p className="bb-kicker">SMART BOOK LOCATION</p>
            <h3>QR Book Locator</h3>
            <p className="bb-muted">
              Librarians generate unique QR codes for books. Scan a code
              to view its details and shelf location.
            </p>

            <button
              className="bb-btn"
              onClick={() => setScanOpen(true)}
            >
              Open camera scanner
            </button>

            {scanOpen && (
              <QRScanner
                onScan={scanQR}
                onClose={() => setScanOpen(false)}
              />
            )}

            {scanResult && (
              <div className="bb-scan-result">
                <h3>{scanResult.title}</h3>
                <p>Author: {scanResult.author}</p>
                <p>Category: {scanResult.category}</p>
                <p>Rack: {scanResult.rack}</p>
                <p>Available copies: {scanResult.availableCopies}</p>
              </div>
            )}

            <div className="bb-book-grid mt-4">
              {books.map(book => (
                <article className="bb-book-card" key={book._id}>
                  <div className="bb-cover">
                    <small>BOOKBRIDGE</small>
                    <strong>{book.title}</strong>
                    <span>{book.rack || "No rack assigned"}</span>
                  </div>

                  <div className="bb-book-info">
                    <h4>{book.title}</h4>
                    <p>{book.author}</p>
                    <button
                      className="bb-btn"
                      onClick={() => setQrBook(book)}
                    >
                      Generate / view QR
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {tab === "exchange" && (
          <section className="bb-panel">
            <p className="bb-kicker">READ • SHARE • REPEAT</p>
            <h3>Book Exchange</h3>

            <form
              className="bb-form"
              onSubmit={async e => {
                e.preventDefault();

                const result = await run(
                  () => client.post("/exchanges", exchangeForm),
                  "Exchange request submitted."
                );

                if (result) {
                  setExchangeForm({
                    bookId: "",
                    message: ""
                  });
                }
              }}
            >
              <label>Select a book</label>

              <select
                required
                value={exchangeForm.bookId}
                onChange={e =>
                  setExchangeForm({
                    ...exchangeForm,
                    bookId: e.target.value
                  })
                }
              >
                <option value="">Choose a book</option>

                {books.map(book => (
                  <option key={book._id} value={book._id}>
                    {book.title} — {book.author}
                  </option>
                ))}
              </select>

              {books.length === 0 && (
                <p className="bb-empty">
                  No books are available in the list. Add books in Book
                  Library or ask the librarian to add them.
                </p>
              )}

              <button
                type="button"
                className="bb-btn secondary"
                onClick={load}
              >
                Refresh books
              </button>

              <label>Message / exchange details</label>
              <textarea
                rows="3"
                placeholder="Tell the librarian what you want to exchange..."
                value={exchangeForm.message}
                onChange={e =>
                  setExchangeForm({
                    ...exchangeForm,
                    message: e.target.value
                  })
                }
              />

              <button
                className="bb-btn"
                disabled={books.length === 0}
              >
                Submit exchange request
              </button>
            </form>

            <h4 className="mt-4">Exchange requests</h4>

            <div className="bb-table-wrap">
              <table className="table bb-table">
                <thead>
                  <tr>
                    <th>Book</th>
                    <th>Requester</th>
                    <th>Message</th>
                    <th>Status</th>
                    {librarian && <th>Actions</th>}
                  </tr>
                </thead>

                <tbody>
                  {exchanges.map(item => (
                    <tr key={item._id}>
                      <td>{item.book?.title}</td>
                      <td>{item.requester?.name || "Student"}</td>
                      <td>{item.message || "—"}</td>
                      <td>
                        <span className="bb-status">{item.status}</span>
                      </td>

                      {librarian && (
                        <td>
                          {item.status === "Pending" && (
                            <>
                              <button
                                className="bb-btn small"
                                onClick={() =>
                                  run(
                                    () =>
                                      client.patch(
                                        `/exchanges/${item._id}`,
                                        { status: "Accepted" }
                                      ),
                                    "Request accepted."
                                  )
                                }
                              >
                                Accept
                              </button>{" "}

                              <button
                                className="bb-btn danger small"
                                onClick={() =>
                                  run(
                                    () =>
                                      client.patch(
                                        `/exchanges/${item._id}`,
                                        { status: "Rejected" }
                                      ),
                                    "Request rejected."
                                  )
                                }
                              >
                                Reject
                              </button>
                            </>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {exchanges.length === 0 && (
              <p className="bb-empty">No exchange requests yet.</p>
            )}
          </section>
        )}

        {tab === "seats" && (
          <section className="bb-panel">
            <p className="bb-kicker">STUDY SPACE RESERVATION</p>
            <h3>Library Seat Booking</h3>

            <div className="bb-form-grid bb-seat-controls">
              <div>
                <label>Choose date</label>
                <input
                  type="date"
                  min={today}
                  value={date}
                  onChange={e => setDate(e.target.value)}
                />
              </div>

              <div>
                <label>Time slot</label>
                <select
                  value={slot}
                  onChange={e => setSlot(e.target.value)}
                >
                  {SLOTS.map(s => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>

            <p className="bb-muted">
              Green seats are available; grey seats are already booked
              for the selected date and slot.
            </p>

            <div className="bb-seat-grid">
              {Array.from({ length: 40 }, (_, i) => i + 1).map(number => {
                const occupied = seatData.bookings.some(
                  b =>
                    b.seatNumber === number &&
                    b.slot === slot &&
                    b.status === "Booked"
                );

                return (
                  <button
                    key={number}
                    disabled={occupied}
                    className={`bb-seat ${
                      occupied
                        ? "occupied"
                        : Number(seat) === number
                          ? "selected"
                          : ""
                    }`}
                    onClick={() => setSeat(number)}
                  >
                    {number}
                  </button>
                );
              })}
            </div>

            <p className="bb-muted mt-3">
              Selected seat: <strong>{seat}</strong> · Slot:{" "}
              <strong>{slot}</strong>
            </p>

            <button className="bb-btn" onClick={bookSeat}>
              Confirm seat booking
            </button>

            <h4 className="mt-4">My / library bookings</h4>

            <div className="bb-table-wrap">
              <table className="table bb-table">
                <thead>
                  <tr>
                    <th>Seat</th>
                    <th>Date</th>
                    <th>Slot</th>
                    <th>Student</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>

                <tbody>
                  {bookings.map(b => (
                    <tr key={b._id}>
                      <td>{b.seatNumber}</td>
                      <td>{b.date}</td>
                      <td>{b.slot}</td>
                      <td>{b.student?.name || user.name}</td>
                      <td>{b.status}</td>
                      <td>
                        {b.status === "Booked" && (
                          <button
                            className="bb-btn danger small"
                            onClick={() =>
                              run(
                                () =>
                                  client.post(`/seats/${b._id}/cancel`),
                                "Booking cancelled."
                              )
                            }
                          >
                            Cancel
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {tab === "loans" && (
          <section className="bb-panel">
            <p className="bb-kicker">CIRCULATION MANAGEMENT</p>
            <h3>
              {librarian ? "Issue & Return Books" : "My Borrowed Books"}
            </h3>

            {librarian && (
              <form className="bb-form" onSubmit={issueBook}>
                <h4>Issue a book to a registered student</h4>

                <label>Book</label>
                <select
                  required
                  value={issueForm.bookId}
                  onChange={e =>
                    setIssueForm({
                      ...issueForm,
                      bookId: e.target.value
                    })
                  }
                >
                  <option value="">Select a book</option>
                  {books
                    .filter(b => (b.availableCopies ?? 0) > 0)
                    .map(b => (
                      <option key={b._id} value={b._id}>
                        {b.title} ({b.availableCopies} available)
                      </option>
                    ))}
                </select>

                <label>Student email</label>
                <input
                  required
                  type="email"
                  value={issueForm.studentEmail}
                  onChange={e =>
                    setIssueForm({
                      ...issueForm,
                      studentEmail: e.target.value
                    })
                  }
                  placeholder="Registered student email"
                />

                <label>Due date</label>
                <input
                  required
                  type="date"
                  min={today}
                  value={issueForm.dueDate}
                  onChange={e =>
                    setIssueForm({
                      ...issueForm,
                      dueDate: e.target.value
                    })
                  }
                />

                <button className="bb-btn">Issue book</button>
              </form>
            )}

            <div className="bb-table-wrap">
              <table className="table bb-table">
                <thead>
                  <tr>
                    <th>Book</th>
                    {librarian && <th>Student</th>}
                    <th>Issue date</th>
                    <th>Due date</th>
                    <th>Return date</th>
                    <th>Status</th>
                    {librarian && <th>Action</th>}
                  </tr>
                </thead>

                <tbody>
                  {loans.map(loan => (
                    <tr key={loan._id}>
                      <td>{loan.book?.title}</td>

                      {librarian && (
                        <td>
                          {loan.student?.name}
                          <br />
                          <small>{loan.student?.email}</small>
                        </td>
                      )}

                      <td>
                        {new Date(loan.issueDate).toLocaleDateString()}
                      </td>
                      <td>
                        {new Date(loan.dueDate).toLocaleDateString()}
                      </td>
                      <td>
                        {loan.returnDate
                          ? new Date(loan.returnDate).toLocaleDateString()
                          : "—"}
                      </td>
                      <td>
                        <span className="bb-status">
                          {loan.status === "Issued" &&
                          new Date(loan.dueDate) < new Date()
                            ? "Overdue"
                            : loan.status}
                        </span>
                      </td>

                      {librarian && (
                        <td>
                          {loan.status === "Issued" && (
                            <button
                              className="bb-btn small"
                              onClick={() =>
                                run(
                                  () =>
                                    client.post(
                                      `/loans/${loan._id}/return`
                                    ),
                                  "Book returned."
                                )
                              }
                            >
                              Return
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {loans.length === 0 && (
              <p className="bb-empty">No issue records yet.</p>
            )}
          </section>
        )}

        {tab === "logs" && librarian && (
          <section className="bb-panel">
            <p className="bb-kicker">AUDIT TRAIL</p>
            <h3>Activity Logs</h3>

            <div className="bb-table-wrap">
              <table className="table bb-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>User</th>
                    <th>Role</th>
                    <th>Action</th>
                    <th>Details</th>
                  </tr>
                </thead>

                <tbody>
                  {logs.map(log => (
                    <tr key={log._id}>
                      <td>
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                      <td>{log.user?.name || "Unknown"}</td>
                      <td>{log.user?.role || "—"}</td>
                      <td>{log.action}</td>
                      <td>{log.details}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {logs.length === 0 && (
              <p className="bb-empty">No activity logged yet.</p>
            )}
          </section>
        )}
      </main>

      {qrBook && (
        <div
          className="bb-modal-backdrop"
          onClick={() => setQrBook(null)}
        >
          <div
            className="bb-qr-modal"
            onClick={e => e.stopPropagation()}
          >
            <button
              className="bb-modal-close"
              onClick={() => setQrBook(null)}
            >
              ×
            </button>

            <p className="bb-kicker">UNIQUE BOOK IDENTIFIER</p>
            <h3>{qrBook.title}</h3>
            <p>{qrBook.author}</p>

            <div className="bb-qr-image">
              <QRCodeCanvas
                value={qrBook._id}
                size={220}
                includeMargin
              />
            </div>

            <p>Rack: {qrBook.rack || "Not assigned"}</p>

            <button
              className="bb-btn"
              onClick={() => window.print()}
            >
              Print QR code
            </button>
          </div>
        </div>
      )}
    </div>
  );
}