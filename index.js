const express = require("express");
const { Client } = require("pg");
require("dotenv").config();
const cors = require("cors");
const tenant_id = 1;

const app = express();
app.use(cors());
app.use(express.json());
const port = process.env.PORT || 8000;

const client = new Client({
  host: process.env.HOST,
  user: process.env.USER,
  port: process.env.DB_PORT,
  password: process.env.PASSWORD,
  database: process.env.DATABASE,
});

let connectedToDb = false;
client
  .connect()
  .then(console.log("Connected to Database"))
  .then((connectedToDb = true));

// get all rooms based on tenant id

app.get("/", (req, res) => {
  res.send("Advance Booking API");
});

app.get("/rooms", (req, res) => {
  client.query(
    `select room_no, description from room_details where tenant_info_id = ${tenant_id}`,
    (err, result) => {
      if (!err) {
        // console.log(result.rows);
        res.send(result.rows);
      } else {
        console.error(err);
      }
      client.end;
    }
  );
});

// get advance booking data based on tenant id
app.get("/advancebookings", (req, res) => {
  client.query(
    `SELECT * FROM advance_booking_view WHERE tenant_id = ${tenant_id}`,
    (err, result) => {
      if (!err) {
        // console.log(result.rows);
        res.send(result.rows);
      } else {
        console.error(err);
      }
      client.end;
    }
  );
});

// create advance booking

// romdom room allocation code

const availableRooms = {};
const AllRoomsMap = {};
const RoomDetails = {
  room_details_id: 0,
  room_type: "",
};

const getRoomsByTenantId = async (tenantId) => {
  try {
    const query = {
      text: "SELECT room_details_id, room_type FROM room_details WHERE tenant_info_id = $1",
      values: [tenantId],
    };

    const result = await client.query(query);

    return result.rows;
  } catch (error) {
    console.error("Error fetching rooms:", error);
    throw error;
  }
};

const getAllocatedRoomsForRange = async (
  roomType,
  startDateTime,
  endDateTime
) => {
  try {
    const query = {
      text: `SELECT room_details_id FROM advance_booking_view 
             WHERE room_type = $1 
             AND (
               (booking_start <= $2 AND booking_end >= $3) 
               OR 
               (booking_start >= $4 AND booking_start < $5) 
               OR 
               (booking_end > $6 AND booking_end <= $7)
             )`,
      values: [
        roomType,
        endDateTime,
        startDateTime,
        startDateTime,
        endDateTime,
        startDateTime,
        endDateTime,
      ],
    };

    const result = await client.query(query);

    return result.rows.map((booking) => booking.room_details_id);
  } catch (error) {
    console.error("Error fetching allocated rooms:", error);
    throw error;
  }
};

const getRoomDetailsIdFromRoomNo = async (roomNo) => {
  try {
    const query = {
      text: "SELECT room_details_id FROM room_details WHERE room_no = $1 LIMIT 1",
      values: [roomNo],
    };

    const result = await client.query(query);

    return result.rows.length > 0 ? result.rows[0].room_details_id : -1;
  } catch (error) {
    console.error("Error fetching room details ID:", error);
    throw error;
  }
};

app.post("/create", async (req, res) => {
  const data = req.body;
  const {
    name,
    mobile_no,
    email,
    room_type,
    no_of_rooms,
    room_no,
    start_date,
    end_date,
  } = data;
  // console.log(data);

  const room_details_id = await getRoomDetailsIdFromRoomNo(room_no);
  const tenant_id = 1;

  try {
    const rooms = await getRoomsByTenantId(tenant_id);
    const allRooms = {};
    rooms.forEach((room) => {
      allRooms[room.room_details_id] = room.room_type;
    });

    const allocatedRooms = await getAllocatedRoomsForRange(
      room_type,
      start_date,
      end_date
    );

    const availableRooms = Object.keys(allRooms).filter((roomNo) => {
      const roomNumber = Number(roomNo);
      return (
        !allocatedRooms.includes(roomNumber) &&
        allRooms[roomNumber] === room_type
      );
    });
    if (availableRooms.length === 0) {
      return res
        .status(404)
        .send("No available rooms for the specified criteria.");
    }
    const bookings = [];
    const roomsAllocated = [];

    // random allocation case
    if (room_no === undefined || no_of_rooms > 1) {
      for (let i = 0; i < no_of_rooms; i++) {
        const selectedRoomId =
          availableRooms[Math.floor(Math.random() * availableRooms.length)];
        const eResult = await client.query({
          text: `INSERT INTO advance_booking (name, mobile_no, email_address, booking_start, booking_end, tenant_id, room_details_id)
                     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING adv_booking_id`,
          values: [
            name,
            mobile_no,
            email,
            start_date,
            end_date,
            tenant_id,
            selectedRoomId,
          ],
        });
        const adv_booking_id = eResult.rows[0].adv_booking_id;
        // console.log("Bookings Created");
        // console.log(adv_booking_id);
        bookings.push(adv_booking_id);
      }
    }
    // required room_no. is given
    else {
      const roomDetailsId = await getRoomDetailsIdFromRoomNo(room_no);

      if (availableRooms.includes(String(roomDetailsId))) {
        const eResult = await client.query({
          text: `INSERT INTO advance_booking (name, mobile_no, email_address, booking_start, booking_end, tenant_id, room_details_id)
                 VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING adv_booking_id`,
          values: [
            name,
            mobile_no,
            email,
            start_date,
            end_date,
            tenant_id,
            roomDetailsId,
          ],
        });

        const adv_booking_id = eResult.rows[0].adv_booking_id;
        bookings.push(adv_booking_id);
        // console.log(adv_booking_id);
      } else {
        console.log("Selected room is not available.");
        res.status(200).send({
          error: false,
          msg: "Selected room is not available.",
        });
      }
    }
    // console.log(bookings);
    if (bookings.length > 0) {
      console.log(
        "New Booking(s) created! Booking IDs: " + bookings.join(", ")
      );
      res.status(200).send({
        error: false,
        msg: "New Booking(s) created!",
        bookingId: bookings,
      });
    } else {
      console.log("No new bookings created.");
      res.status(200).send({
        error: false,
        msg: "No new bookings created.",
      });
    }
  } catch (error) {
    console.error("Error creating booking:", error);
    res.status(500).send("Error creating booking");
  }
});

app.post("/update", async (req, res) => {
  const data = req.body;
  // for checkin update
  if (
    "adv_booking_id" in data &&
    "checkedIn" in data &&
    Object.keys(data).length === 2
  ) {
    try {
      const { adv_booking_id, checkedIn } = data;

      await client.query({
        text: `UPDATE advance_booking
               SET checked_in = true
               WHERE adv_booking_id = $1`,
        values: [adv_booking_id],
      });

      console.log(
        `Checked-in status updated successfully for booking ${adv_booking_id}`
      );
      res
        .status(200)
        .json({ message: "Checked-in status updated successfully" });
    } catch (error) {
      console.error("Error updating checked-in status:", error);
      res.status(500).json({ error: "Error updating checked-in status" });
    }
  }
  // for details update
  else {
    const {
      adv_booking_id,
      name,
      mobile_no,
      email,
      room_type,
      address,
      city,
      room_no,
      start_date,
      end_date,
    } = data;
    // console.log(data);

    try {
      const room_details_id = await getRoomDetailsIdFromRoomNo(room_no);
      const tenant_id = 1;

      const allBookingsQuery = {
        text: `SELECT booking_start, booking_end
             FROM advance_booking
             WHERE room_details_id = $1
             AND tenant_id = $2
             AND adv_booking_id != $3`,
        values: [room_details_id, tenant_id, adv_booking_id],
      };
      const allBookingsResult = await client.query(allBookingsQuery);
      const roomBookings = allBookingsResult.rows.map((booking) => ({
        startDate: booking.booking_start,
        endDate: booking.booking_end,
      }));
      // console.log(allocatedRooms);
      // console.log(room_details_id);
      const overlapExists = roomBookings.some((booking) => {
        const bookingStartDate = new Date(booking.startDate);
        const bookingEndDate = new Date(booking.endDate);
        const newStartDate = new Date(start_date);
        const newEndDate = new Date(end_date);

        // Check if the new booking overlaps with any existing booking
        return (
          (newStartDate >= bookingStartDate && newStartDate < bookingEndDate) ||
          (newEndDate > bookingStartDate && newEndDate <= bookingEndDate) ||
          (newStartDate <= bookingStartDate && newEndDate >= bookingEndDate)
        );
      });

      // console.log(roomBookings);
      // console.log(start_date);
      // console.log(end_date);
      if (overlapExists) {
        // res.status(200).send("Room is already booked for selected time.");
        res
          .status(200)
          .json({ message: "Room is already booked for selected time." });
      } else {
        await client.query({
          text: `UPDATE advance_booking
               SET name = $1,
                   mobile_no = $2,
                   email_address = $3,
                   booking_start = $4,
                   booking_end = $5,
                   room_details_id = $6,
                   booking_address = $9,
                   booking_city = $10
               WHERE adv_booking_id = $7 AND tenant_id = $8`,
          values: [
            name,
            mobile_no,
            email,
            start_date,
            end_date,
            room_details_id,
            adv_booking_id,
            tenant_id,
            address,
            city,
          ],
        });

        console.log(`Booking updated successfully ${adv_booking_id}`);
        // res.status(200).send("Booking updated successfully");
        res.status(200).json({ message: "Booking updated successfully" });
      }
    } catch (error) {
      console.error("Error updating booking:", error);
      res.status(500).send("Error updating booking");
    }
  }
});

app.listen(port, () => {
  console.log(`App listening on port ${port}`);
});
