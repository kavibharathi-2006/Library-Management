
const mongoose = require("mongoose");

const seatBookingSchema = new mongoose.Schema(
  {
    seatNumber: {
      type: Number,
      required: true,
      min: 1,
      max: 40
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    date: {
      type: String,
      required: true
    },
    slot: {
      type: String,
      enum: [
        "09:00-11:00",
        "11:00-13:00",
        "13:00-15:00",
        "15:00-17:00"
      ],
      required: true
    },
    status: {
      type: String,
      enum: ["Booked", "Cancelled"],
      default: "Booked"
    }
  },
  { timestamps: true }
);

seatBookingSchema.index(
  { seatNumber: 1, date: 1, slot: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "Booked" }
  }
);

module.exports = mongoose.model("SeatBooking", seatBookingSchema);
