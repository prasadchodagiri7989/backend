'use strict';

const mongoose = require('mongoose');

const JobSearchSchema = new mongoose.Schema(
  {
    searchTerm: { type: String, required: true, trim: true },
    location: { type: String, default: '', trim: true },
    sites: [{ type: String, trim: true }],
    filters: { type: mongoose.Schema.Types.Mixed, default: {} },
    resultsCount: { type: Number, default: 0 },
    searchId: { type: String, default: '' },
    csvFileId: { type: Number, default: null },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
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

JobSearchSchema.index({ createdAt: -1 });

module.exports = mongoose.model('JobSearch', JobSearchSchema);
