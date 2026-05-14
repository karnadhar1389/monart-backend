import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import dotenv from "dotenv";
import Stripe from "stripe";
import sgMail from "@sendgrid/mail";

dotenv.config();

// =======================
// 🔐 CONFIG
// =======================

sgMail.setApiKey(process.env.SENDGRID_API_KEY);
console.log("SENDGRID KEY:", process.env.SENDGRID_API_KEY ? "Loaded ✅" : "Missing ❌");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const app = express();
app.use(cors());
app.use(express.json());

// =======================
// 🔐 ADMIN LOGIN CHECK
// =======================

app.post("/api/admin-login", (req, res) => {
  try {

    console.log("ADMIN LOGIN BODY:", req.body);

    const { email } = req.body;

    const isAdmin =
      email === "admin@monicasart.com";

    res.json({
      isAdmin
    });

  } catch (err) {

    console.error("ADMIN LOGIN ERROR:", err);

    res.status(500).json({
      error: err.message
    });
  }
});

// =======================
// 💳 CREATE PAYMENT INTENT
// =======================

app.post("/api/create-payment-intent", async (req, res) => {
  try {
    const { amount } = req.body;

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: "eur",
      automatic_payment_methods: {
        enabled: true,
      },
    });

    res.json({ clientSecret: paymentIntent.client_secret });

  } catch (err) {
    console.error("Stripe error:", err);
    res.status(500).json({ error: err.message });
  }
});

// =======================
// 🗄 DATABASE
// =======================

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.log("Mongo Error:", err));

// =======================
// 🧾 ORDER MODEL
// =======================

const orderSchema = new mongoose.Schema({
  userEmail: String,
  items: Array,
  total: Number,
  shipping: Object,
  paymentIntentId: String, // ✅ already added
  status: { type: String, default: "pending" },
  createdAt: { type: Date, default: Date.now }
});

const Order = mongoose.model("Order", orderSchema);

// =======================
// 📦 CREATE ORDER
// =======================

app.post("/api/orders", async (req, res) => {
  try {

    console.log("📥 INCOMING ORDER:", req.body); // 🔥 FIX (DEBUG)

    // =======================
    // 🔥 FIX 1: STRICT VALIDATION
    // =======================

    if (
      !req.body.paymentIntentId ||
      !req.body.items ||
      req.body.items.length === 0 ||
      !req.body.total ||
      !req.body.shipping
    ) {
      console.log("⚠️ Invalid order blocked:", req.body);
      return res.status(400).json({ error: "Invalid order" });
    }

    // =======================
    // 🔥 FIX 2: DUPLICATE PREVENTION
    // =======================

    const existing = await Order.findOne({
      paymentIntentId: req.body.paymentIntentId
    });

    if (existing) {
      console.log("⚠️ Duplicate prevented:", existing._id);
      return res.json(existing);
    }

    // =======================
    // ✅ SAVE ORDER
    // =======================

    const order = new Order(req.body);
    await order.save();

    console.log("📦 Order saved:", order._id);

    // =======================
    // 🔥 FIX 3: SAFE EMAIL (NO CRASH)
    // =======================

    try {
      console.log("📧 Sending email to:", order.userEmail);

      await sgMail.send({
        to: order.userEmail,
        from: process.env.EMAIL_USER,
        subject: "Your Order is Confirmed 🛍️",
//         html: `
// <div style="font-family:Arial; background:#f9f9f9; padding:20px;">
//   <div style="max-width:600px; margin:auto; background:#fff; padding:24px; border-radius:8px;">

//     <h2 style="text-align:center;">🎉 Thank you for your order!</h2>

//     <p style="text-align:center;">Order ID: <b>${order._id}</b></p>
//     <p style="text-align:center;">Total: <b>$${order.total}</b></p>

//     <hr/>

//     <h3>📦 Items</h3>

//     ${order.items.map(item => `
//       <div style="display:flex; gap:10px; margin-bottom:10px;">
//         <img src="${item.images?.[0] || 'https://via.placeholder.com/80'}"
//              width="70" height="70" style="object-fit:cover;border-radius:6px;" />

//         <div>
//           <b>${item.name}</b><br/>
//           Qty: ${item.qty}<br/>
//           $${item.price}
//         </div>
//       </div>
//     `).join("")}

//     <hr/>

//     <h3>📍 Shipping</h3>

//     <p>
//       ${order.shipping?.firstName || ""} ${order.shipping?.lastName || ""}<br/>
//       ${order.shipping?.address || ""}<br/>
//       ${order.shipping?.city || ""}, ${order.shipping?.zip || ""}<br/>
//       ${order.shipping?.country || ""}
//     </p>

//     <p>
//       🚚 Estimated Delivery:
//       <b>${new Date(Date.now() + 5*86400000).toDateString()}</b>
//     </p>

//     <div style="text-align:center;margin-top:20px;">
//       <a href="http://localhost:5173/account"
//          style="background:#d89c7a;color:white;padding:10px 16px;border-radius:6px;text-decoration:none;">
//          View Orders
//       </a>
//     </div>

//   </div>
// </div>
// `
html: `
<div style="margin:0;padding:40px 0;background:#f8f5f1;font-family:Arial,sans-serif;color:#2d2d2d;">

  <div style="max-width:700px;margin:auto;background:#ffffff;border-radius:28px;overflow:hidden;box-shadow:0 15px 50px rgba(0,0,0,0.06);">

    <!-- HEADER -->
    <div style="background:linear-gradient(135deg,#f7efe7,#fffaf5);padding:50px 40px;text-align:center;border-bottom:1px solid #f0e8df;">

      <div style="font-size:54px;margin-bottom:12px;">✨</div>

      <h1 style="margin:0;font-size:40px;font-weight:500;color:#1f1f1f;">
        Thank You For Your Order
      </h1>

      <p style="margin-top:16px;font-size:16px;color:#8b7d72;line-height:1.8;">
        Your handcrafted jewelry is now being carefully prepared with love.
      </p>

    </div>

    <!-- BODY -->
    <div style="padding:45px;">

      <!-- ORDER SUMMARY -->
      <div style="background:#fcfaf8;border:1px solid #eee3d8;border-radius:22px;padding:30px;margin-bottom:35px;">

        <table width="100%" cellspacing="0" cellpadding="0">
          <tr>
            <td style="padding-bottom:18px;">
              <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#b49b84;">
                Order ID
              </div>

              <div style="font-size:17px;font-weight:600;margin-top:8px;">
                ${order._id}
              </div>
            </td>

            <td align="right" style="padding-bottom:18px;">
              <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#b49b84;">
                Total
              </div>

              <div style="font-size:30px;font-weight:600;color:#c49b63;margin-top:8px;">
                €${order.total.toFixed(2)}
              </div>
            </td>
          </tr>
        </table>

      </div>

     <!-- ITEMS -->
<h2 style="
  font-size:28px;
  font-weight:500;
  margin-bottom:32px;
  color:#2d2d2d;
  font-family:Georgia, serif;
">
  Your Items
</h2>

${order.items.map(item => `
  
  <table width="100%" cellpadding="0" cellspacing="0" style="
    border-bottom:1px solid #f3ece4;
    padding:24px 0;
    margin-bottom:18px;
  ">
    <tr>

      <!-- LEFT SIDE -->
      <td valign="top" style="width:100px;">

        <img
          src="${item.images?.[0] || 'https://via.placeholder.com/90'}"
          width="90"
          height="90"
          style="
            border-radius:18px;
            object-fit:cover;
            border:1px solid #eee;
            display:block;
          "
        />

      </td>

      <!-- CENTER INFO -->
      <td valign="top" style="
        padding-left:18px;
      ">

        <div style="
          font-size:20px;
          font-weight:500;
          color:#2d2d2d;
          margin-bottom:8px;
          line-height:1.4;
        ">
          ${item.name}
        </div>

        <div style="
          color:#a89b8d;
          font-size:14px;
        ">
          Quantity: ${item.qty}
        </div>

      </td>

      <!-- RIGHT PRICE -->
      <td valign="top" align="right" style="
        width:120px;
        white-space:nowrap;
      ">

        <div style="
          font-size:28px;
          font-weight:500;
          color:#caa46d;
          font-family:Georgia, serif;
        ">
          €${(item.price * item.qty).toFixed(2)}
        </div>

      </td>

    </tr>
  </table>

`).join("")}

      <!-- SHIPPING -->
      <div style="margin-top:40px;background:#fcfaf8;border:1px solid #eee3d8;border-radius:22px;padding:30px;">

        <h3 style="margin-top:0;font-size:22px;font-weight:500;">
          Shipping Address
        </h3>

        <div style="color:#7b736a;line-height:2;font-size:15px;">
          ${order.shipping?.firstName || ""} ${order.shipping?.lastName || ""}<br/>
          ${order.shipping?.address || ""}<br/>
          ${order.shipping?.zip || ""} ${order.shipping?.city || ""}<br/>
          ${order.shipping?.country || ""}
        </div>

      </div>

      <!-- DELIVERY -->
      <div style="margin-top:32px;text-align:center;color:#7b736a;font-size:16px;">
        🚚 Estimated Delivery:
        <strong style="color:#2d2d2d;">
          ${new Date(Date.now() + 5*86400000).toDateString()}
        </strong>
      </div>

      <!-- BUTTON -->
      <div style="text-align:center;margin-top:42px;">

        <a
          href="http://localhost:5173/account"
          style="
            display:inline-block;
            background:linear-gradient(135deg,#c49b63,#e4c08d);
            color:white;
            text-decoration:none;
            padding:18px 38px;
            border-radius:999px;
            font-size:15px;
            font-weight:600;
            letter-spacing:1px;
            box-shadow:0 10px 25px rgba(196,155,99,0.25);
          "
        >
          VIEW YOUR ORDERS
        </a>

      </div>

    </div>

  </div>

</div>
`
      });

      console.log("✅ Email sent");

    } catch (emailErr) {
      console.error("❌ Email failed:", emailErr.message);
    }

    res.json(order);

  } catch (err) {
    console.error("❌ ORDER ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// =======================
// 📊 GET ORDERS
// =======================

app.get("/api/orders", async (req, res) => {
  try {
    const { email } = req.query;

    let query = {};
    if (email) {
      query.userEmail = email;
    }

    const orders = await Order.find(query).sort({ createdAt: -1 });

    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});


// 🟢 ADD THIS NEW ROUTE JUST BELOW 👇
app.get("/api/orders-by-payment/:id", async (req, res) => {
  try {
    const order = await Order.findOne({
      paymentIntentId: req.params.id
    });

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =======================
// 🔄 UPDATE STATUS
// =======================

app.put("/api/orders/:id", async (req, res) => {
  try {
    const updated = await Order.findByIdAndUpdate(
      req.params.id,
      { status: req.body.status },
      { new: true }
    );

    // 🔥 FIX: don't crash if email fails
    try {
      await sgMail.send({
        to: updated.userEmail,
        from: process.env.EMAIL_USER,
        subject: "Order Update 📦",
        // html: `
        //   <h2>Order Update</h2>
        //   <p>Your order <b>${updated._id}</b> is now:</p>
        //   <h3>${updated.status}</h3>
        // `

        html: `
<div style="margin:0;padding:50px 0;background:#f8f5f1;font-family:Arial,sans-serif;">

  <div style="max-width:640px;margin:auto;background:white;border-radius:28px;overflow:hidden;box-shadow:0 15px 50px rgba(0,0,0,0.06);">

    <!-- TOP -->
    <div style="padding:50px 40px;background:linear-gradient(135deg,#f7efe7,#fffaf5);text-align:center;">

      <div style="font-size:52px;margin-bottom:12px;">📦</div>

      <h1 style="margin:0;font-size:38px;font-weight:500;color:#1f1f1f;">
        Order Update
      </h1>

      <p style="margin-top:18px;color:#8b7d72;font-size:16px;line-height:1.8;">
        Your MonArt order status has been updated.
      </p>

    </div>

    <!-- BODY -->
    <div style="padding:45px;text-align:center;">

      <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#b49b84;margin-bottom:12px;">
        Order ID
      </div>

      <div style="font-size:18px;font-weight:600;color:#2d2d2d;margin-bottom:34px;">
        ${updated._id}
      </div>

      <div style="font-size:14px;color:#7b736a;margin-bottom:18px;">
        Current Status
      </div>

      <div
        style="
          display:inline-block;
          padding:16px 34px;
          border-radius:999px;
          background:#f7efe1;
          color:#c4973f;
          font-size:15px;
          font-weight:700;
          letter-spacing:2px;
          text-transform:uppercase;
          margin-bottom:40px;
        "
      >
        ${updated.status}
      </div>

      <div style="color:#7b736a;font-size:15px;line-height:1.9;">
        Thank you for supporting handmade craftsmanship ✨
      </div>

      <div style="margin-top:42px;">

        <a
          href="http://localhost:5173/account"
          style="
            display:inline-block;
            background:linear-gradient(135deg,#c49b63,#e4c08d);
            color:white;
            text-decoration:none;
            padding:18px 38px;
            border-radius:999px;
            font-size:15px;
            font-weight:600;
            letter-spacing:1px;
            box-shadow:0 10px 25px rgba(196,155,99,0.25);
          "
        >
          VIEW ORDER
        </a>

      </div>

    </div>

  </div>

</div>
`
      });
    } catch (e) {
      console.log("Email fail ignored");
    }

    res.json(updated);

  } catch {
    res.status(500).json({ error: "Failed to update order" });
  }
});

// =======================
// 🟢 SERVER
// =======================

app.listen(5000, () => {
  console.log("Server running on http://localhost:5000");
});