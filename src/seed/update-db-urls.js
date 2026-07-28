'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Course = require('../models/Course');

const updateUrls = async () => {
  await connectDB();

  const courses = await Course.find();
  let updatedCount = 0;
  let topicCount = 0;

  for (const course of courses) {
    let courseUpdated = false;
    for (const module of course.modules) {
      for (const topic of module.topics) {
        if (topic.videoUrl && (topic.videoUrl.includes('youtube.com') || topic.videoUrl.includes('youtu.be') || topic.videoUrl.includes('x7X9w_GIm1s'))) {
          topic.videoUrl = 'https://livid.com/watch/pprKswOhxAi0';
          topicCount++;
          courseUpdated = true;
        }
      }
    }
    if (courseUpdated) {
      // Mark modules modified because Mongoose mixed array type sometimes requires explicit markModified
      course.markModified('modules');
      await course.save();
      updatedCount++;
    }
  }

  console.log(`Successfully updated ${topicCount} topics across ${updatedCount} courses to Livid video URLs.`);
  await mongoose.disconnect();
  console.log('Disconnected from MongoDB.');
};

updateUrls().catch((err) => {
  console.error('Update failed:', err);
  process.exit(1);
});
