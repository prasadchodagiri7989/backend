'use strict';

const mongoose = require('mongoose');

const JobSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    company: { type: String, required: true, trim: true },
    location: { type: String, default: '', trim: true },
    site: { type: String, default: 'other', trim: true },
    job_type: { type: String, default: 'fulltime', trim: true },
    is_remote: { type: Boolean, default: false },
    salary: {
      min_amount: { type: Number, default: null },
      max_amount: { type: Number, default: null },
      currency: { type: String, default: '' },
      interval: { type: String, default: '' },
    },
    date_posted: { type: String, default: '' },
    job_url: { type: String, required: true, trim: true },
    job_url_direct: { type: String, default: '', trim: true },
    description: { type: String, default: '' },
    skills: [{ type: String, trim: true }],
    status: {
      type: String,
      enum: ['active', 'archived'],
      default: 'active',
      index: true,
    },
    pushedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    searchId: { type: String, default: null },
    rawJson: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_, ret) => {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Search indexes for title, company, location, and description
JobSchema.index({ title: 'text', company: 'text', location: 'text', description: 'text' });
JobSchema.index({ createdAt: -1 });
JobSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Job', JobSchema);
