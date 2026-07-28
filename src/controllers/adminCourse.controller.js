"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateModule = updateModule;
exports.reorderModules = reorderModules;
exports.duplicateModule = duplicateModule;
exports.copyModuleToCourse = copyModuleToCourse;
exports.updateTopic = updateTopic;
exports.reorderTopics = reorderTopics;
const Course_1 = __importDefault(require("../models/Course"));
/**
 * Format a Mongoose course object to match the structure the admin dashboard expects.
 */
const formatCourse = (c) => ({
    id: c._id.toString(),
    title: c.title,
    description: c.description,
    thumbnail: c.thumbnail,
    lessonsCount: c.lessonsCount,
    moduleCount: c.modules.length,
    topicCount: c.modules.reduce((sum, m) => sum + m.topics.length, 0),
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    modules: c.modules.map((m) => ({
        id: m._id.toString(),
        title: m.title,
        topics: m.topics.map((t) => ({
            id: t._id.toString(),
            title: t.title,
            videoUrl: t.videoUrl || '',
            videoId: t.videoId || '',
            completed: t.completed || false,
            notes: t.notes || '',
        })),
    })),
});
/**
 * Rename a module
 * PUT /api/admin/courses/:id/modules/:moduleId
 */
async function updateModule(req, res, next) {
    try {
        const { id, moduleId } = req.params;
        const { title } = req.body;
        if (!title) {
            return res.status(400).json({ error: 'Module title is required' });
        }
        const course = await Course_1.default.findOneAndUpdate({ _id: id, 'modules._id': moduleId }, { $set: { 'modules.$.title': title } }, { new: true });
        if (!course) {
            return res.status(404).json({ error: 'Course or module not found' });
        }
        return res.json(formatCourse(course.toObject()));
    }
    catch (err) {
        next(err);
    }
}
/**
 * Reorder modules within a course
 * PUT /api/admin/courses/:id/modules/reorder
 */
async function reorderModules(req, res, next) {
    try {
        const { id } = req.params;
        const { moduleIds } = req.body; // array of module IDs in desired order
        if (!Array.isArray(moduleIds)) {
            return res.status(400).json({ error: 'moduleIds array is required' });
        }
        const course = await Course_1.default.findById(id);
        if (!course) {
            return res.status(404).json({ error: 'Course not found' });
        }
        // Sort modules based on the incoming list of IDs
        const sortedModules = [];
        for (const mId of moduleIds) {
            const found = course.modules.id(mId);
            if (found) {
                sortedModules.push(found);
            }
        }
        // Append any modules not specified in the list (safety check)
        for (const m of course.modules) {
            if (!moduleIds.includes(m._id.toString())) {
                sortedModules.push(m);
            }
        }
        course.modules = sortedModules;
        await course.save();
        return res.json(formatCourse(course.toObject()));
    }
    catch (err) {
        next(err);
    }
}
/**
 * Duplicate a module and its topics inside the same course
 * POST /api/admin/courses/:id/modules/:moduleId/duplicate
 */
async function duplicateModule(req, res, next) {
    try {
        const { id, moduleId } = req.params;
        const course = await Course_1.default.findById(id);
        if (!course) {
            return res.status(404).json({ error: 'Course not found' });
        }
        const sourceModule = course.modules.id(moduleId);
        if (!sourceModule) {
            return res.status(404).json({ error: 'Module not found' });
        }
        // Perform deep copy and construct a new module subdocument
        const duplicatedModule = {
            title: `${sourceModule.title} (Copy)`,
            topics: sourceModule.topics.map((t) => ({
                title: t.title,
                videoUrl: t.videoUrl,
                videoId: t.videoId,
                notes: t.notes,
                completed: false
            }))
        };
        course.modules.push(duplicatedModule);
        // Update lessonsCount
        course.lessonsCount = course.modules.reduce((s, m) => s + m.topics.length, 0);
        await course.save();
        return res.json(formatCourse(course.toObject()));
    }
    catch (err) {
        next(err);
    }
}
/**
 * Copy a module and its topics to a different course
 * POST /api/admin/courses/:id/modules/:moduleId/copy-to/:targetCourseId
 */
async function copyModuleToCourse(req, res, next) {
    try {
        const { id, moduleId, targetCourseId } = req.params;
        const sourceCourse = await Course_1.default.findById(id);
        if (!sourceCourse) {
            return res.status(404).json({ error: 'Source course not found' });
        }
        const targetCourse = await Course_1.default.findById(targetCourseId);
        if (!targetCourse) {
            return res.status(404).json({ error: 'Target course not found' });
        }
        const sourceModule = sourceCourse.modules.id(moduleId);
        if (!sourceModule) {
            return res.status(404).json({ error: 'Module not found' });
        }
        // Perform deep copy
        const copiedModule = {
            title: `${sourceModule.title} (from ${sourceCourse.title})`,
            topics: sourceModule.topics.map((t) => ({
                title: t.title,
                videoUrl: t.videoUrl,
                videoId: t.videoId,
                notes: t.notes,
                completed: false
            }))
        };
        targetCourse.modules.push(copiedModule);
        // Update target course lessons count
        targetCourse.lessonsCount = targetCourse.modules.reduce((s, m) => s + m.topics.length, 0);
        await targetCourse.save();
        return res.json({ message: 'Module copied successfully' });
    }
    catch (err) {
        next(err);
    }
}
/**
 * Update topic details (title, videoId, videoUrl)
 * PUT /api/admin/courses/:id/modules/:moduleId/topics/:topicId
 */
async function updateTopic(req, res, next) {
    try {
        const { id, moduleId, topicId } = req.params;
        const { title, videoId, videoUrl } = req.body;
        const course = await Course_1.default.findById(id);
        if (!course) {
            return res.status(404).json({ error: 'Course not found' });
        }
        const mod = course.modules.id(moduleId);
        if (!mod) {
            return res.status(404).json({ error: 'Module not found' });
        }
        const topic = mod.topics.id(topicId);
        if (!topic) {
            return res.status(404).json({ error: 'Topic not found' });
        }
        if (title !== undefined)
            topic.title = title;
        if (videoId !== undefined)
            topic.videoId = videoId;
        if (videoUrl !== undefined)
            topic.videoUrl = videoUrl;
        await course.save();
        return res.json(formatCourse(course.toObject()));
    }
    catch (err) {
        next(err);
    }
}
/**
 * Reorder topics inside a module
 * PUT /api/admin/courses/:id/modules/:moduleId/topics/reorder
 */
async function reorderTopics(req, res, next) {
    try {
        const { id, moduleId } = req.params;
        const { topicIds } = req.body; // array of topic IDs in desired order
        if (!Array.isArray(topicIds)) {
            return res.status(400).json({ error: 'topicIds array is required' });
        }
        const course = await Course_1.default.findById(id);
        if (!course) {
            return res.status(404).json({ error: 'Course not found' });
        }
        const mod = course.modules.id(moduleId);
        if (!mod) {
            return res.status(404).json({ error: 'Module not found' });
        }
        // Sort topics based on incoming topicIds array
        const sortedTopics = [];
        for (const tId of topicIds) {
            const found = mod.topics.id(tId);
            if (found) {
                sortedTopics.push(found);
            }
        }
        // Append any topics not specified in the list (safety check)
        for (const t of mod.topics) {
            if (!topicIds.includes(t._id.toString())) {
                sortedTopics.push(t);
            }
        }
        mod.topics = sortedTopics;
        await course.save();
        return res.json(formatCourse(course.toObject()));
    }
    catch (err) {
        next(err);
    }
}
