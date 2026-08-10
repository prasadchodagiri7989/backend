'use strict';

const mongoose = require('mongoose');

const BatchSchema = new mongoose.Schema(
  {
    name:        { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
    members:     [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    courses:     [{ type: mongoose.Schema.Types.ObjectId, ref: 'Course' }],
    moduleOrder: [
      {
        courseId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
        moduleIds: [{ type: mongoose.Schema.Types.ObjectId }]
      }
    ],
  },
  { timestamps: true }
);

// Reusable transform
BatchSchema.set('toJSON', {
  virtuals: true,
  transform: (_, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Batch', BatchSchema);
