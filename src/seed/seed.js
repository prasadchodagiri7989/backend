'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const mongoose     = require('mongoose');
const connectDB    = require('../config/db');
const Course       = require('../models/Course');
const Announcement = require('../models/Announcement');
const Certificate  = require('../models/Certificate');
const User         = require('../models/User');
const LoginHistory = require('../models/LoginHistory');
const Batch        = require('../models/Batch');

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

const seed = async () => {
  await connectDB();

  // Clear existing collections
  await Promise.all([
    Course.deleteMany({}),
    Announcement.deleteMany({}),
    Certificate.deleteMany({}),
    LoginHistory.deleteMany({}),
    User.deleteMany({}),
    Batch.deleteMany({}),
  ]);

  // Drop and re-sync User indexes so sparse:true on googleId takes effect
  await User.collection.dropIndexes().catch(() => {});
  await User.syncIndexes();

  // 1. Create Batches
  const batch1 = await Batch.create({
    name: 'Batch Alpha',
    description: 'Morning lectures on advanced engineering principles.',
  });
  const batch2 = await Batch.create({
    name: 'Batch Beta',
    description: 'Evening classes on stack architectures and fullstack projects.',
  });

  // 2. Create Courses
  const sampleCourse = await Course.create({
    title: 'Introduction to SkyLearn (Sample)',
    description: 'An introductory course showing the features of the SkyLearn LMS. Available to all users, even pending approval.',
    thumbnail: `${BASE_URL}/thumbnails/course-thumb-1.jpg`,
    isSample: true,
    batches: [],
    lessonsCount: 2,
    modules: [
      {
        title: 'Welcome to SkyLearn',
        topics: [
          {
            title: 'Exploring the Dashboard',
            completed: false,
            videoType: 'youtube',
            videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            notes: '<h2>Welcome to the LMS!</h2><p>Here you can explore features, view modules, and see how simple learning is on SkyLearn.</p>'
          },
          {
            title: 'Learning Best Practices',
            completed: false,
            videoType: 'bunny',
            videoId: 'e3f48eff-6b17-47e7-a4cc-3433adebb20d',
            notes: '<h2>Tips for Success</h2><p>Set a schedule, practice active recall, and make the most of notes.</p>'
          }
        ]
      }
    ]
  });

  const courseAlpha = await Course.create({
    title: 'Advanced Frontend Frameworks (React & Vue)',
    description: 'A deep dive into virtual DOM rendering, state management machines, and custom hooks.',
    thumbnail: `${BASE_URL}/thumbnails/course-thumb-2.jpg`,
    isSample: false,
    batches: [batch1._id],
    lessonsCount: 2,
    modules: [
      {
        title: 'Advanced React State Patterns',
        topics: [
          {
            title: 'Vite & TS Setup',
            completed: false,
            videoType: 'bunny',
            videoId: 'e3f48eff-6b17-47e7-a4cc-3433adebb20d',
            notes: '<h2>Initializing a modern app</h2><p>Configure TS compiler options, ESLint rules, and vite aliases.</p>'
          },
          {
            title: 'Building Custom State Machines',
            completed: false,
            videoType: 'youtube',
            videoUrl: 'https://www.youtube.com/watch?v=Ke90Tje7VS0',
            notes: '<h2>Designing clean handlers</h2><p>Separate UI side-effects from controller state triggers.</p>'
          }
        ]
      }
    ]
  });

  const courseBeta = await Course.create({
    title: 'Node.js & MongoDB Backend Engineering',
    description: 'Learn middleware construction, security policies, rate-limiting, and REST API design.',
    thumbnail: `${BASE_URL}/thumbnails/course-thumb-3.jpg`,
    isSample: false,
    batches: [batch2._id],
    lessonsCount: 1,
    modules: [
      {
        title: 'Mongoose Schemas & Controllers',
        topics: [
          {
            title: 'Modeling Relationships',
            completed: false,
            videoType: 'bunny',
            videoId: 'e3f48eff-6b17-47e7-a4cc-3433adebb20d',
            notes: '<h2>Linking documents</h2><p>Use refs, population queries, and pre-save hooks to maintain DB synchrony.</p>'
          }
        ]
      }
    ]
  });

  // Link courses back to Batches to keep sync Course <-> Batch relationships
  batch1.courses.push(courseAlpha._id);
  await batch1.save();

  batch2.courses.push(courseBeta._id);
  await batch2.save();

  // 3. Create Users
  // Admin user
  const adminHash = await User.hashPassword('BIMbim!@#123');
  await User.create({
    name: 'BIM Era Admin',
    email: 'bimerapvtltd@gmail.com',
    password: adminHash,
    role: 'admin',
    status: 'active',
  });

  // Pending Student User
  const studentHash = await User.hashPassword('Student123!');
  await User.create({
    name: 'Jane Doe',
    email: 'student@example.com',
    password: studentHash,
    role: 'student',
    status: 'pending',
  });

  // Active Student User (preset in Batch Alpha)
  const activeStudentHash = await User.hashPassword('Student123!');
  const activeStudent = await User.create({
    name: 'John Smith',
    email: 'active@example.com',
    password: activeStudentHash,
    role: 'student',
    status: 'active',
  });

  // Add to batch1
  batch1.members.push(activeStudent._id);
  await batch1.save();

  // 4. Create announcements
  await Announcement.create({
    title: 'SkyLearn LMS Launch',
    description: 'We are proud to introduce SkyLearn LMS with Batch segmentation and custom video sources.',
    targetRole: 'all',
    date: '2026-08-05',
  });

  console.log('Seeding complete successfully!');
  console.log('\nUsers Seeded:');
  console.log('  [admin]   bimerapvtltd@gmail.com  /  BIMbim!@#123');
  console.log('  [student] student@example.com     /  Student123! (status: pending)');
  console.log('  [student] active@example.com      /  Student123! (status: active, Batch Alpha)');
  console.log('\nBatches Seeded:');
  console.log('  - Batch Alpha (has 1 member, 1 course)');
  console.log('  - Batch Beta (has 0 members, 1 course)');

  await mongoose.disconnect();
};

seed().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
