'use strict';

const mongoose = require('mongoose');

const PublishedExternalJobSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      default: 'Curated Career Opportunities',
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    jobs: [
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
        rawJson: { type: mongoose.Schema.Types.Mixed, default: {} },
      },
    ],
    jobsCount: {
      type: Number,
      default: 0,
    },
    publishedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    status: {
      type: String,
      enum: ['active', 'archived'],
      default: 'active',
      index: true,
    },
    views: {
      type: Number,
      default: 0,
    },
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

PublishedExternalJobSchema.index({ createdAt: -1 });

module.exports = mongoose.model('PublishedExternalJob', PublishedExternalJobSchema);
