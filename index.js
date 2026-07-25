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

        // Filter
        app.get("/artworks/filters", async (req, res) => {
            try {
                const categories = await ArtWorks.distinct("category");
                const statuses = await ArtWorks.distinct("status");
                res.send({
                    categories: categories.filter(Boolean),
                    statuses: statuses.filter(Boolean),
                });
            } catch (error) {
                res.status(500).send({ error: error.message });
            }
        });

        // Top Artists
        app.get("/artists/top", async (req, res) => {
            try {
                const artists = await User.find({ role: "artist" }).toArray();
                const artistIds = artists.map(artist => artist._id.toString());

                // Fetch artworks for these artists only
                const artworks = await ArtWorks.find({ artistId: { $in: artistIds } }).toArray();

                const artistMap = {};
                artists.forEach(artist => {
                    artistMap[artist._id.toString()] = {
                        id: artist._id.toString(),
                        name: artist.name,
                        email: artist.email,
                        image: artist.image || "/default-avatar.png",
                        artworks: 0,
                        sales: 0
                    };
                });

                artworks.forEach(art => {
                    const aId = art.artistId;
                    if (aId && artistMap[aId]) {
                        artistMap[aId].artworks++;
                        if (art.isSold || art.status === "sold") {
                            artistMap[aId].sales++;
                        }
                    }
                });

                const topArtists = Object.values(artistMap)
                    .sort((a, b) => {
                        const scoreA = a.sales * 10 + a.artworks;
                        const scoreB = b.sales * 10 + b.artworks;
                        return scoreB - scoreA;
                    })
                    .slice(0, 3);

                res.send(topArtists);
            } catch (error) {
                res.status(500).send({ error: error.message });
            }
        });

        app.post("/artworks", async (req, res) => {
            try {
                const {
                    title,
                    category,
                    description,
                    price,
                    image,
                    artistName,
                    artistEmail,
                    artistId,
                } = req.body;

                if (
                    !title ||
                    !category ||
                    !price ||
                    !image ||
                    !artistName ||
                    !artistEmail
                ) {
                    return res.status(400).send({ error: "Missing required fields" });
                }

                const newArtwork = {
                    title,
                    category,
                    description: description || "",
                    price: parseFloat(price),
                    image,
                    artistName,
                    artistEmail,
                    artistId: artistId || null,
                    status: "available",
                    isSold: false,
                    createdAt: new Date().toISOString(),
                    purchasedBy: null,
                };

                const result = await ArtWorks.insertOne(newArtwork);
                res.status(201).send({ success: true, insertedId: result.insertedId });
            } catch (error) {
                res.status(500).send({ error: error.message });
            }
        });

        app.patch("/artworks/:id", async (req, res) => {
            try {
                const { id } = req.params;
                if (!ObjectId.isValid(id)) {
                    return res.status(400).send({ error: "Invalid artwork id" });
                }

                const { title, category, description, price } = req.body;
                const updateFields = {};

                if (title !== undefined) updateFields.title = title;
                if (category !== undefined) updateFields.category = category;
                if (description !== undefined) updateFields.description = description;
                if (price !== undefined) {
                    const parsedPrice = parseFloat(price);
                    if (Number.isNaN(parsedPrice)) {
                        return res.status(400).send({ error: "Invalid price" });
                    }
                    updateFields.price = parsedPrice;
                }

                if (Object.keys(updateFields).length === 0) {
                    return res
                        .status(400)
                        .send({ error: "No artwork fields provided to update" });
                }

                const result = await ArtWorks.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: updateFields },
                );

                if (result.matchedCount === 0) {
                    return res.status(404).send({ error: "Artwork not found" });
                }

                res.send({ success: true });
            } catch (error) {
                res.status(500).send({ error: error.message });
            }
        });

        app.delete("/artworks/:id", async (req, res) => {
            try {
                const { id } = req.params;
                if (!ObjectId.isValid(id)) {
                    return res.status(400).send({ error: "Invalid artwork id" });
                }

                const result = await ArtWorks.deleteOne({ _id: new ObjectId(id) });
                if (result.deletedCount === 0) {
                    return res.status(404).send({ error: "Artwork not found" });
                }

                res.send({ success: true });
            } catch (error) {
                res.status(500).send({ error: error.message });
            }
        });

        app.post("/create-checkout/artwork/:id", async (req, res) => {
            try {
                const { id } = req.params;
                const { buyerId, buyerName, buyerEmail, buyerImage } = req.body;

                if (!ObjectId.isValid(id)) {
                    return res.status(400).send({ error: "Invalid artwork id" });
                }
                if (!ObjectId.isValid(buyerId)) {
                    return res.status(400).send({ error: "Invalid buyer id" });
                }

                const artwork = await ArtWorks.findOne({ _id: new ObjectId(id) });
                const buyer = await User.findOne({ _id: new ObjectId(buyerId) });

                if (!artwork) {
                    return res.status(404).send({ error: "Artwork not found" });
                }
                if (!buyer) {
                    return res.status(404).send({ error: "Buyer not found" });
                }
                if (artwork.isSold) {
                    return res.status(400).send({ error: "Artwork already sold" });
                }
                if (artwork.artistId === buyerId) {
                    return res.status(400).send({ error: "Artists cannot purchase their own artwork" });
                }
                if (buyer.role === "artist") {
                    return res.status(403).send({ error: "Artist accounts cannot purchase artworks" });
                }
                if (!buyer.subscription) {
                    return res.status(400).send({ error: "No subscription found" });
                }

                const currentMonth = new Date().toISOString().slice(0, 7);
                let subscription = buyer.subscription;

                if (subscription.currentMonth !== currentMonth) {
                    subscription.purchasedThisMonth = 0;
                    subscription.currentMonth = currentMonth;
                    await User.updateOne(
                        { _id: new ObjectId(buyerId) },
                        {
                            $set: {
                                "subscription.purchasedThisMonth": 0,
                                "subscription.currentMonth": currentMonth,
                            },
                        }
                    );
                }

                if (
                    subscription.purchaseLimit !== -1 &&
                    subscription.purchasedThisMonth >= subscription.purchaseLimit
                ) {
                    return res.status(403).send({ error: "Monthly purchase limit reached" });
                }

                const session = await stripe.checkout.sessions.create({
                    customer_email: buyerEmail || buyer?.email || undefined,
                    payment_method_types: ["card"],
                    line_items: [
                        {
                            price_data: {
                                currency: "usd",
                                product_data: {
                                    name: artwork.title,
                                    images: artwork.image ? [artwork.image] : [],
                                },
                                unit_amount: Math.round(artwork.price * 100),
                            },
                            quantity: 1,
                        },
                    ],
                    mode: "payment",
                    success_url: `${process.env.CLIENT_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
                    cancel_url: `${process.env.CLIENT_URL}/payment-cancel`,
                    metadata: {
                        artworkId: id.toString(),
                        buyerId: buyerId.toString(),
                        buyerName: String(buyerName || buyer.name || ""),
                        buyerEmail: String(buyerEmail || buyer.email || ""),
                        buyerImage: String(buyerImage || buyer.image || ""),
                        type: "artwork",
                    },
                });

                res.send({ url: session.url });
            } catch (error) {
                res.status(500).send({ error: error.message });
            }
        });

        app.post("/create-checkout/subscription", async (req, res) => {
            try {
                const { userId, plan } = req.body;

                if (!ObjectId.isValid(userId)) {
                    return res.status(400).send({ error: "Invalid user id" });
                }

                const user = await User.findOne({ _id: new ObjectId(userId) });
                if (!user) {
                    return res.status(404).send({ error: "User not found" });
                }

