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