
const mongoose = require("mongoose");

const bookSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true
    },
    author: {
      type: String,
      required: true,
      trim: true
    },
    category: {
      type: String,
      default: "General"
    },
    isbn: {
      type: String,
      default: ""
    },
    rack: {
      type: String,
      default: "Not assigned"
    },
    quantity: {
      type: Number,
      default: 1,
      min: 0
    },
    availableCopies: {
      type: Number,
      default: 1,
      min: 0
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Book", bookSchema);
