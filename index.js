import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import { ObjectId } from "mongodb";
import { toNodeHandler } from "better-auth/node";
import { auth, client } from "./auth.js";
import Stripe from "stripe";

let ArtWorks, User, PurchasesArtworks, SubscriptionHistory;

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const app = express();
const Port = process.env.PORT;
// CORS setup
app.use(
    cors({
        origin: process.env.CLIENT_URL,
        credentials: true,
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
    }),
);

app.all("/api/auth/*splat", toNodeHandler(auth));

// Webhook route
app.post(
    "/webhook",
    express.raw({ type: "*/*" }),
    async (req, res) => {
        const sig = req.headers["stripe-signature"];
        let event;

        console.log("Webhook body type:", typeof req.body);
        console.log("Is Buffer:", Buffer.isBuffer(req.body));
        console.log("Body length:", req.body ? req.body.length : "null");
        console.log("Stripe Signature Header:", sig);
        console.log("Secret in code:", process.env.STRIPE_WEBHOOK_SECRET);

        try {
            event = stripe.webhooks.constructEvent(
                req.body,
                sig,
                process.env.STRIPE_WEBHOOK_SECRET,
            );
        } catch (err) {
            console.error("Webhook signature verification failed:", err.message);
            return res.status(400).send(`Webhook Error: ${err.message}`);
        }

        if (event.type === "checkout.session.completed") {
            const session = event.data.object;
            const metadata = session.metadata;

            try {
                if (metadata.type === "subscription") {
                    const { userId, plan } = metadata;
                    const dbUser = await User.findOne({ _id: new ObjectId(userId) });
                    if (dbUser) {
                        const previousPlan = dbUser.subscription?.plan || "free";
                        let purchaseLimit = 3;
                        if (plan === "pro") {
                            purchaseLimit = 9;
                        }
                        if (plan === "premium") {
                            purchaseLimit = -1;
                        }
                        await User.updateOne(
                            { _id: new ObjectId(userId) },
                            {
                                $set: {
                                    subscription: {
                                        plan,
                                        purchaseLimit,
                                        purchasedThisMonth: 0,
                                        currentMonth: new Date().toISOString().slice(0, 7),
                                    },
                                },
                            },
                        );
                        const transactionId = `AH-S-${userId.toString().slice(-6).toUpperCase()}`;
                        await SubscriptionHistory.insertOne({
                            transactionId,
                            userId,
                            userName: dbUser.name,
                            userEmail: dbUser.email,
                            previousPlan: previousPlan,
                            newPlan: plan,
                            changedAt: new Date().toISOString(),
                        });
                    }
                } else if (metadata.type === "artwork") {
                    const { artworkId, buyerId, buyerName, buyerEmail, buyerImage } = metadata;
                    const artwork = await ArtWorks.findOne({ _id: new ObjectId(artworkId) });
                    const buyer = await User.findOne({ _id: new ObjectId(buyerId) });

                    if (artwork && buyer && !artwork.isSold) {
                        const transactionId = `AH-P-${artwork._id.toString().slice(-6).toUpperCase()}`;
                        const purchaseData = {
                            transactionId,
                            artworkId: artwork._id.toString(),
                            artworkTitle: artwork.title,
                            artworkImage: artwork.image,
                            artworkCategory: artwork.category,
                            price: artwork.price,
                            artistId: artwork.artistId,
                            artistName: artwork.artistName,
                            buyerId,
                            buyerName: buyerName || buyer.name,
                            buyerEmail: buyerEmail || buyer.email,
                            buyerImage: buyerImage || buyer.image || null,
                            purchasedAt: new Date().toISOString(),
                        };

                        await PurchasesArtworks.insertOne(purchaseData);

                        await ArtWorks.updateOne(
                            { _id: new ObjectId(artworkId) },
                            {
                                $set: {
                                    status: "sold",
                                    isSold: true,
                                    purchasedBy: buyerName || buyer.name,
                                },
                            },
                        );

                        await User.updateOne(
                            { _id: new ObjectId(buyerId) },
                            {
                                $inc: {
                                    "subscription.purchasedThisMonth": 1,
                                },
                            },
                        );
                    }
                }
            } catch (dbError) {
                console.error("Database operation failed in webhook:", dbError);
                return res.status(500).send(`Webhook DB Error: ${dbError.message}`);
            }
        }

        res.send({ received: true });
    }
);

app.use(express.json());

app.get("/", (req, res) => {
    res.send(`ArtHub Server`);
});

const run = async () => {
    try {
        await client.connect();
        const db = client.db("ArtHub");
        ArtWorks = db.collection("ArtWorks");
        User = db.collection("user");
        PurchasesArtworks = db.collection("purchasesArtworks");
        const Comments = db.collection("Comments");
        SubscriptionHistory = db.collection("SubscriptionHistory");

        app.get("/artworks", async (req, res) => {
            try {
                const { search, category, status, sort, artistId, page, limit } =
                    req.query;
                let query = {};

                if (search) {
                    query.$or = [
                        { title: { $regex: search, $options: "i" } },
                        { artistName: { $regex: search, $options: "i" } },
                    ];
                }

                if (category) {
                    query.category = category;
                }

                if (status) {
                    query.status = status;
                }

                if (artistId) {
                    query.artistId = artistId;
                }

                let sortOption = {};
                if (sort === "a-z") {
                    sortOption.title = 1;
                } else if (sort === "z-a") {
                    sortOption.title = -1;
                } else if (sort === "low-to-high") {
                    sortOption.price = 1;
                } else if (sort === "high-to-low") {
                    sortOption.price = -1;
                } else {
                    sortOption._id = -1;
                }

                let cursor = ArtWorks.find(query).sort(sortOption);

                if (page) {
                    const parsedPage = parseInt(page, 10) || 1;
                    const parsedLimit = parseInt(limit, 10) || 12;
                    const skip = (parsedPage - 1) * parsedLimit;

                    const totalCount = await ArtWorks.countDocuments(query);
                    const artworks = await cursor.skip(skip).limit(parsedLimit).toArray();

                    res.send({
                        artworks,
                        totalCount,
                        totalPages: Math.ceil(totalCount / parsedLimit),
                        currentPage: parsedPage,
                    });
                } else {
                    if (limit) {
                        cursor = cursor.limit(parseInt(limit, 10));
                    }
                    const final = await cursor.toArray();
                    res.send(final);
                }
            } catch (error) {
                res.status(500).send({ error: error.message });
            }
        });