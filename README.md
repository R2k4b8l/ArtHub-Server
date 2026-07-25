<div align="center">

# 🔧 ArtHub Server

### _The Engine Behind the Marketplace._

### _Auth, Payments & Data — All in One API._

<br/>

[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge&logo=node.js)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-5.x-000000?style=for-the-badge&logo=express)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?style=for-the-badge&logo=mongodb)](https://mongodb.com/)
[![BetterAuth](https://img.shields.io/badge/BetterAuth-1.6.19-6E56CF?style=for-the-badge&logo=auth0)](https://www.better-auth.com/)
[![JWT](https://img.shields.io/badge/JWT-Auth-000000?style=for-the-badge&logo=jsonwebtokens)](https://jwt.io/)
[![Stripe](https://img.shields.io/badge/Stripe-Payments-635BFF?style=for-the-badge&logo=stripe)](https://stripe.com/)

<br/>

[![MIT License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)
[![Vercel](https://img.shields.io/badge/Deployed_on-Vercel-black?style=flat-square&logo=vercel)](https://vercel.com)
[![PRs Welcome](https://img.shields.io/badge/PRs-Welcome-brightgreen?style=flat-square)](https://github.com/Abid-Hossain-Sifat/ArtHub-Server/pulls)

</div>

---

## 🌟 Project Overview

**ArtHub Server** is the REST API powering **ArtHub**, a full-stack digital art marketplace that connects independent artists with collectors. It handles everything the frontend can't do on its own: authenticating users, enforcing subscription-based purchase limits, processing Stripe payments, and serving analytics to the admin dashboard.

Built with **Express 5** and the **native MongoDB driver**, and secured with **BetterAuth** (JWT + Google OAuth), the server exposes a lean, single-service API designed to be fast to reason about and easy to deploy as a Vercel serverless function.

---

## 💡 Why This Backend?

### The Problem

A marketplace connecting artists and collectors needs more than a database — it needs trustworthy payment processing, enforceable purchase limits, and a single source of truth for who owns what role and who bought what artwork.

### The Solution

ArtHub Server solves this by:

- Centralizing **authentication and role management** through BetterAuth, so the frontend never has to trust a client-side role claim alone
- Enforcing **subscription purchase limits** server-side, so a Free-plan buyer can't bypass the 3-artwork cap from the client
- Driving every payment through **Stripe Checkout + signed webhooks**, so purchases and subscription upgrades are only finalized after Stripe confirms the money actually moved
- Keeping all artwork, purchase, comment, and subscription data in **MongoDB collections** that stay in sync whenever a user updates their profile

### Why It Was Built

ArtHub Server was built to demonstrate real-world backend patterns — webhook-driven payment finalization, JWT session issuance, role-gated business logic, and aggregation-pipeline-powered reporting — without unnecessary abstraction layers.

---

## 🔑 Key Features

### 🔐 Authentication & Authorization

- Email/password sign-up and login powered by **BetterAuth**
- **Google OAuth 2.0** social login via BetterAuth's social provider config
- **JWT tokens** issued with 7-day expiry, cached in secure cookies
- Default `role: "user"` and a free-tier `subscription` object auto-assigned on account creation via a database hook
- Email change supported without re-verification

### 🎨 Artwork Management

- Create, update, and delete artwork listings (title, category, description, price, image, artist info)
- Each artwork tracks a `status` (`available` / `sold`) and `isSold` flag
- Server-side **search** (title/artist name, regex, case-insensitive), **category/status filtering**, and **sorting** (A-Z, Z-A, price low-high, price high-low, newest)
- Server-side **pagination** with `totalCount`, `totalPages`, and `currentPage` in the response

### 💳 Stripe Payment Integration

- **Stripe Checkout Sessions** for one-time artwork purchases
- **Stripe Checkout Sessions** for subscription plan upgrades
- **Stripe Webhook** (`checkout.session.completed`) finalizes purchases and subscription changes only after payment is confirmed
- Auto-generated transaction IDs: `AH-P-XXXXXX` for purchases, `AH-S-XXXXXX` for subscriptions
- Payment verification endpoint for the frontend's success/cancel pages

### 📦 Subscription System

| Plan    | Monthly Purchase Limit | Price  |
| ------- | ---------------------- | ------ |
| Free    | 3 artworks/month       | $0     |
| Pro     | 9 artworks/month       | $9.99  |
| Premium | Unlimited              | $19.99 |

- Monthly purchase counters auto-reset whenever a request detects a new calendar month
- A `/sync-purchases` endpoint can recalculate every user's monthly count directly from purchase records
- Every plan change is logged to a `SubscriptionHistory` collection with `previousPlan` → `newPlan`

### 💬 Comments System

- Buyers (role: `user`) can post comments on artworks
- Posting is **role-restricted** — only `user`-role accounts can comment
- `GET /comments/user/:userId` uses a MongoDB aggregation pipeline to join each comment with its artwork's title and image

### 📊 Analytics & Reporting

- `GET /transactions` merges artwork purchases and subscription changes into one unified, sorted transaction feed
- `GET /transactions/daily` groups revenue by day (artwork income vs. subscription income) for the admin dashboard's Recharts chart
- `GET /artist/:id/stats` returns an artist's total and sold artwork counts
- `GET /artists/top` ranks artists by a weighted score of sales and artwork volume, returning the top 3

### 👤 Profile Cascade Updates

- Updating a user's name, email, or avatar via `PATCH /user/:id/profile` cascades the change across **every related collection** — artworks, purchases, comments, and subscription history — so data never goes stale across the platform

### 🛡️ Validation & Error Handling

- `ObjectId.isValid()` guards on every route that accepts a MongoDB ID
- Required-field checks before all write operations
- Consistent JSON error responses with appropriate HTTP status codes

---

## 👥 User Roles (Enforced Server-Side)

### 🛍️ Buyer (role: `user`)

The default role assigned to every new signup. The server allows buyers to:

- Browse, search, and purchase artworks (within their monthly subscription limit)
- Post comments on artwork pages
- Upgrade their subscription plan via Stripe
- View their own purchase and comment history

### 🎨 Artist (role: `artist`)

Promoted from Buyer by an Admin. The server allows artists to:

- Create, edit, and delete their own artwork listings
- View their own sales history and artist stats
- **Blocked** from purchasing artworks and from posting comments — enforced explicitly in route logic

### 🛡️ Admin (role: `admin`)

The platform administrator. The server exposes endpoints that let admins:

- View and update any user's role
- View all transactions (purchases + subscriptions) and daily revenue breakdowns
- Manually trigger a purchase-count sync across all users

---

## 🛠️ Technology Stack

| Category           | Technology                              |
| ------------------ | --------------------------------------- |
| **Runtime**        | Node.js (ES Modules)                    |
| **Framework**      | Express 5.x                             |
| **Database**       | MongoDB Atlas (native `mongodb` driver) |
| **Authentication** | BetterAuth v1.6.19 (JWT + Google OAuth) |
| **OAuth**          | Passport.js + `passport-google-oauth20` |
| **Payment**        | Stripe (Checkout Sessions + Webhooks)   |
| **Sessions**       | `express-session`                       |
| **Config**         | dotenv                                  |
| **Deployment**     | Vercel (Serverless Functions)           |

---

## 📦 NPM Packages Used

| Category         | Package                                            | Purpose                                  |
| ---------------- | -------------------------------------------------- | ---------------------------------------- |
| **Server**       | `express@5`                                        | HTTP server & routing                    |
| **Database**     | `mongodb@7`                                        | Native MongoDB driver                    |
| **Auth**         | `better-auth@1.6.19`, `@better-auth/mongo-adapter` | Auth server & Mongo session adapter      |
| **Auth (OAuth)** | `passport@0.7`, `passport-google-oauth20`          | Google OAuth strategy support            |
| **Payment**      | `stripe@22`                                        | Checkout Sessions & webhook verification |
| **Middleware**   | `cors@2`, `express-session@1`                      | CORS, session handling                   |
| **Config**       | `dotenv@17`                                        | Environment variable management          |

---

## 📁 Folder Structure

```
ArtHub-Server/
├── index.js          # Express app — all routes, Stripe logic, webhook handler, server bootstrap
├── auth.js           # BetterAuth config — Mongo adapter, JWT plugin, Google OAuth, user hooks
├── package.json       # Project metadata and dependencies
├── package-lock.json   # Locked dependency versions
├── vercel.json        # Vercel serverless deployment config
├── .env               # Environment variables (not committed)
└── .gitignore          # Ignores node_modules and .env
```

> The backend follows a lightweight, single-service architecture — all Express routes live directly in `index.js`, with authentication fully delegated to `auth.js`. No separate `routes/`, `controllers/`, or `models/` directories are used.

---

## 🚀 Installation Guide

### Prerequisites

- Node.js v18+
- MongoDB Atlas account
- Stripe account
- Google Cloud Console project (for OAuth)

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Create a `.env` file in the root directory (see [Environment Variables](#-environment-variables) below).

### 3. Run the Server

```bash
npm start
# Server runs on the port defined by PORT in .env
```

### 4. Set Up Stripe Webhook (Local Development)

```bash
stripe listen --forward-to localhost:5000/webhook
```

### 5. Deploy to Production

The project is pre-configured for **Vercel** serverless deployment via `vercel.json`.

```bash
vercel --prod
```

---

## 🔒 Environment Variables

| Variable                | Description                                                 |
| ----------------------- | ----------------------------------------------------------- |
| `PORT`                  | Port the Express server listens on (local development)      |
| `MONGODB_URI`           | MongoDB Atlas connection string                             |
| `CLIENT_URL`            | Trusted frontend origin (CORS + BetterAuth trusted origins) |
| `BETTER_AUTH_SECRET`    | Secret key used by BetterAuth for signing/encryption        |
| `BETTER_AUTH_URL`       | Base URL of the auth service                                |
| `CLIENT_ID`             | Google OAuth client ID                                      |
| `CLIENT_SECRET`         | Google OAuth client secret                                  |
| `STRIPE_SECRET_KEY`     | Stripe secret API key                                       |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret                               |

> ⚠️ **Never commit `.env` files to version control.** This file is already excluded via `.gitignore`.

---

## 📡 API Overview

### Authentication (BetterAuth)

| Method | Endpoint      | Description                                                                   |
| ------ | ------------- | ----------------------------------------------------------------------------- |
| ALL    | `/api/auth/*` | BetterAuth catch-all — sign up, sign in, Google OAuth, session, JWT, sign out |

### Artworks

| Method | Endpoint            | Description                                          |
| ------ | ------------------- | ---------------------------------------------------- |
| GET    | `/artworks`         | Get all artworks (search, filter, sort, paginate)    |
| GET    | `/artworks/filters` | Get distinct categories and statuses for filter UI   |
| GET    | `/artists/top`      | Get top 3 artists ranked by sales and artwork volume |
| POST   | `/artworks`         | Create a new artwork listing                         |
| PATCH  | `/artworks/:id`     | Update artwork details                               |
| DELETE | `/artworks/:id`     | Delete an artwork                                    |

### Users

| Method | Endpoint                 | Description                                                        |
| ------ | ------------------------ | ------------------------------------------------------------------ |
| GET    | `/user`                  | Get all users (auto-resets monthly subscription counters)          |
| PATCH  | `/user/:id`              | Update a user's role                                               |
| PATCH  | `/user/:id/profile`      | Update profile; cascades to artworks, purchases, comments, history |
| PATCH  | `/user/:id/subscription` | Update subscription plan and log the change                        |
| GET    | `/artist/:id/stats`      | Get an artist's total and sold artwork counts                      |

### Payments (Stripe)

| Method | Endpoint                        | Description                                                |
| ------ | ------------------------------- | ---------------------------------------------------------- |
| POST   | `/create-checkout/artwork/:id`  | Create Stripe Checkout Session for an artwork              |
| POST   | `/create-checkout/subscription` | Create Stripe Checkout Session for a plan                  |
| GET    | `/verify-payment/:sessionId`    | Verify Stripe Checkout Session status                      |
| POST   | `/webhook`                      | Stripe webhook handler — finalizes purchases/subscriptions |

### Purchase History & Transactions

| Method | Endpoint              | Description                                                |
| ------ | --------------------- | ---------------------------------------------------------- |
| POST   | `/purchase/:id`       | Direct (non-Stripe) purchase recorder with limit checks    |
| GET    | `/purchasehistory`    | Get purchases, filtered by `artistId` or `buyerId`         |
| GET    | `/transactions`       | Unified list of all purchase and subscription transactions |
| GET    | `/transactions/daily` | Daily revenue breakdown (artwork vs. subscription income)  |
| PATCH  | `/sync-purchases`     | Recalculate each user's monthly purchase count             |

### Subscriptions

| Method | Endpoint                | Description                                             |
| ------ | ----------------------- | ------------------------------------------------------- |
| GET    | `/subscription-history` | Get subscription change history, optionally by `userId` |

### Comments

| Method | Endpoint                 | Description                                                     |
| ------ | ------------------------ | --------------------------------------------------------------- |
| POST   | `/comments`              | Post a comment on an artwork (restricted to `user` role)        |
| GET    | `/comments/:artworkId`   | Get all comments for a specific artwork                         |
| GET    | `/comments/user/:userId` | Get all comments by a user, joined with artwork title and image |

---

## 🔐 Authentication Flow

ArtHub Server delegates all authentication to **BetterAuth v1.6.19**, mounted at `/api/auth/*` via `toNodeHandler`.

### Email & Password

1. User submits a signup request → BetterAuth creates a user document in MongoDB
2. A `databaseHooks.user.create` **after** hook assigns a default `subscription` object (`plan: "free"`, `purchaseLimit: 3`, `purchasedThisMonth: 0`)
3. A `before` hook ensures every new user defaults to `role: "user"`
4. On login, BetterAuth issues a **JWT** (7-day expiry) cached in a secure cookie for 7 days

### Google OAuth

1. The frontend initiates Google sign-in through BetterAuth's `socialProviders.google` config (`CLIENT_ID` / `CLIENT_SECRET`)
2. On callback, BetterAuth creates or retrieves the user in MongoDB
3. The same JWT/cookie session flow applies

### Cookies & Trusted Origins

- In production, cookies use `secure: true` and `sameSite: "none"` to support cross-origin requests
- In development, `sameSite: "lax"` is used
- Only the configured `CLIENT_URL` is accepted via `trustedOrigins`

### Role-Based Authorization

- `role` (`user` / `artist` / `admin`) is stored directly on the user document and read by both frontend route guards and backend business logic (e.g. artists are blocked from purchasing or commenting)

---

## 💰 Payment Flow

### Artwork Purchase

1. Frontend calls `POST /create-checkout/artwork/:id` with buyer details
2. Server validates: artwork exists and isn't sold, buyer isn't the artist, buyer's role isn't `artist`, buyer has an active subscription, and the monthly purchase limit hasn't been reached
3. A Stripe Checkout Session is created in `payment` mode with artwork metadata (`artworkId`, `buyerId`, `type: "artwork"`)
4. Buyer is redirected to Stripe's hosted checkout page
5. On success, Stripe fires `checkout.session.completed` to `POST /webhook`
6. The webhook handler inserts a `purchasesArtworks` record, marks the artwork `sold`/`isSold: true`, and increments the buyer's `purchasedThisMonth` counter
7. Buyer lands on `/payment-success?session_id=...`, which the frontend verifies via `GET /verify-payment/:sessionId`

### Subscription Upgrade

1. Frontend calls `POST /create-checkout/subscription` with `userId` and `plan` (`pro` or `premium`)
2. A Stripe Checkout Session is created for the plan price ($9.99 or $19.99)
3. On webhook confirmation, the user's `subscription` object is updated with the new plan and purchase limit, and the change is logged to `SubscriptionHistory` with `previousPlan` → `newPlan`

### Transaction IDs

- Purchase: `AH-P-` + last 6 characters of the artwork's ObjectId (uppercase)
- Subscription: `AH-S-` + last 6 characters of the user's ObjectId (uppercase)

### Webhook Security

- `POST /webhook` reads the **raw request body** and verifies the `stripe-signature` header against `STRIPE_WEBHOOK_SECRET` using `stripe.webhooks.constructEvent()` before any database write occurs

---

## 🗃️ Database Collections

The application uses a single MongoDB database (`ArtHub`) with the following collections:

| Collection            | Purpose                                                                     |
| --------------------- | --------------------------------------------------------------------------- |
| `user`                | User accounts (created via BetterAuth) — `role` and embedded `subscription` |
| `ArtWorks`            | Artwork listings — title, category, description, price, image, status       |
| `purchasesArtworks`   | Completed artwork purchases — transaction ID, buyer/artist info, price      |
| `SubscriptionHistory` | Subscription plan change log — previous/new plan, transaction ID, timestamp |
| `Comments`            | User comments tied to artworks                                              |

> BetterAuth also manages its own internal collections (sessions, accounts) automatically within the `ArtHub` database via the Mongo adapter.

---

## 🛡️ Security Features

| Feature                         | Implementation                                                         |
| ------------------------------- | ---------------------------------------------------------------------- |
| **JWT Authentication**          | 7-day tokens via BetterAuth's `jwt` plugin, cookie-cached              |
| **Secure Cookies**              | `sameSite: "none"`, `secure: true` enforced in production              |
| **CORS**                        | Origin-restricted to `CLIENT_URL` only, with `credentials: true`       |
| **Role Validation**             | Backend checks block artists from purchasing or commenting             |
| **Subscription Enforcement**    | Monthly purchase limits validated server-side before checkout          |
| **Stripe Webhook Verification** | `stripe.webhooks.constructEvent()` verifies signature before DB writes |
| **Input Validation**            | Required fields and `ObjectId.isValid()` checks before all DB writes   |
| **Environment Variables**       | All secrets stored in `.env`, excluded via `.gitignore`                |
| **Trusted Origins**             | BetterAuth only accepts auth requests from the configured frontend     |

---

## ⚠️ Error Handling

All API endpoints return a consistent JSON error format:

```json
{
  "error": "Descriptive error message"
}
```

| Status Code | Meaning               | Example Scenario                                                 |
| ----------- | --------------------- | ---------------------------------------------------------------- |
| `200`       | OK                    | Successful GET/PATCH request                                     |
| `201`       | Created               | Artwork or comment successfully created                          |
| `400`       | Bad Request           | Invalid ObjectId, missing fields, invalid plan                   |
| `403`       | Forbidden             | Monthly purchase limit reached, artist attempting to buy/comment |
| `404`       | Not Found             | Artwork, user, or buyer not found                                |
| `500`       | Internal Server Error | Database failure or unexpected exception                         |

Stripe webhook errors return `400` for signature verification failures and `500` for downstream database errors, both with descriptive plain-text messages.

---

## ⚡ Performance Notes

- **Server-Side Pagination** — only the current page of artworks is fetched and counted via `countDocuments`
- **Aggregation Pipelines** — `GET /comments/user/:userId` joins comments with artwork data in a single MongoDB query instead of multiple round-trips
- **Cascading Profile Updates** — a single `PATCH /user/:id/profile` request updates all dependent collections in one call rather than requiring separate client requests
- **Lean Responses** — endpoints return only the fields the frontend needs, keeping payloads small

---

## 🔮 Future Improvements

1. **Authentication Middleware** — enforce JWT verification on protected routes instead of trusting client-supplied IDs
2. **Role-Based Access Middleware** — gate admin-only routes (`/transactions`, `/subscription-history`, `/sync-purchases`) at the server level
3. **Modular Architecture** — split `index.js` into `routes/`, `controllers/`, and `services/` directories
4. **Schema Validation** — adopt Zod or Joi for request validation instead of manual field checks
5. **Centralized Error Handling** — replace per-route try/catch with global Express error-handling middleware
6. **Rate Limiting** — protect public endpoints from abuse
7. **Automated Testing** — unit and integration tests with Jest or Vitest
8. **Stripe Connect** — direct artist payouts via revenue splits
9. **Cron-Based Subscription Resets** — replace on-request monthly recalculation with a scheduled job
10. **Structured Logging** — replace `console.log` with Winston or Pino
11. **Pagination for Comments & Transactions** — extend pagination beyond artworks
12. **Database Indexing** — add explicit indexes on `artistId`, `buyerId`, `category`, `status`
13. **API Documentation** — Swagger/OpenAPI spec for easier frontend integration
14. **Server-Side Image Handling** — integrate with a storage service (e.g. Cloudinary) instead of relying on client-provided URLs
15. **Refund & Dispute Handling** — support additional Stripe webhook events

---

## 👨‍💻 Developer

<div align="center">

**Rakibul hasan reday**
Full Stack MERN Developer

_Built with ❤️ using Express, MongoDB, BetterAuth, and Stripe_

</div>

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

```
MIT License

Copyright (c) 2025 Rakibul hasan reday

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.
```

---

<div align="center">

⭐ **If you found this project helpful, please give it a star!** ⭐

[🌐 Live Demo](https://arthub-ruddy.vercel.app/) &nbsp;|&nbsp;
[📁 Frontend Repo](https://github.com/R2k4b8l/ArtHub) &nbsp;|&nbsp;
[🔧 Backend Repo](https://github.com/R2k4b8l/ArtHub-Server)

</div>
