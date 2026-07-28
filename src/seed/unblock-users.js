'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');

const unblock = async () => {
  await connectDB();
  const res = await User.updateMany({}, { status: 'active' });
  console.log(`Successfully unblocked users. Match count: ${res.matchedCount}, Modified count: ${res.modifiedCount}`);
  await mongoose.disconnect();
};

unblock().catch(console.error);
