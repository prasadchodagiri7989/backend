'use strict';

const mongoose = require('mongoose');

const DiscussionSchema = new mongoose.Schema(
  {
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    topicId:  { type: String, required: true },
    userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    content:  { type: String, required: true },
    attachment: {
      name: { type: String, default: '' },
      url:  { type: String, default: '' },
    },
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Discussion', default: null },
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

module.exports = mongoose.model('Discussion', DiscussionSchema);
