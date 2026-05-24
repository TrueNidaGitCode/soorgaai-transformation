/**
 * SoorgaAI - Assessment Controller
 *
 * Handles all assessment API logic:
 *  - GET  /questions         → return all domains and questions
 *  - POST /submit            → validate answers, score, save
 *  - GET  /results/:id       → fetch scores for an assessment
 *  - POST /report/:id        → generate AI report for an assessment
 *  - GET  /report/:id        → fetch existing AI report
 *  - GET  /my-assessments    → list user's past assessments
 */

import AssessmentResponse from '../models/AssessmentResponse.js';
import AssessmentReport   from '../models/AssessmentReport.js';
import { DOMAINS, MATURITY_STAGES }  from '../data/assessmentQuestions.js';
import { validateAndEnrichAnswers, runScoringPipeline } from '../services/scoringEngine.js';
import { generateMaturityReport } from '../services/reportGenerationService.js';

// ─────────────────────────────────────────────────────────
// GET /questions
// Returns all domains and questions (public — no auth needed)
// ─────────────────────────────────────────────────────────

export const getQuestions = (req, res) => {
  try {
    // Strip options values from frontend response (send labels only — scores are server-side)
    const safeDomains = DOMAINS.map((domain) => ({
      id:          domain.id,
      name:        domain.name,
      description: domain.description,
      icon:        domain.icon,
      questions:   domain.questions.map((q) => ({
        id:      q.id,
        text:    q.text,
        options: q.options.map((o) => ({ value: o.value, label: o.label })),
      })),
    }));

    return res.status(200).json({
      success: true,
      totalDomains:    DOMAINS.length,
      totalQuestions:  DOMAINS.reduce((sum, d) => sum + d.questions.length, 0),
      maturityStages:  MATURITY_STAGES,
      domains:         safeDomains,
    });
  } catch (error) {
    console.error('getQuestions error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load assessment questions.' });
  }
};

// ─────────────────────────────────────────────────────────
// POST /submit
// Body: { answers: [{questionId, value}], orgName?, orgSize?, industry? }
// ─────────────────────────────────────────────────────────

export const submitAssessment = async (req, res) => {
  try {
    const { answers, orgName = '', orgSize = '', industry = '' } = req.body;
    const userId = req.user._id;

    // 1. Validate & enrich answers
    const { valid, errors, enrichedAnswers } = validateAndEnrichAnswers(answers);
    if (!valid) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed. Please check your answers.',
        errors,
      });
    }

    // 2. Run scoring pipeline
    const { domainScores, overallScore, maturityStage, maturityStageDetails } =
      runScoringPipeline(enrichedAnswers);

    // 3. Save to database
    const assessment = await AssessmentResponse.create({
      userId,
      orgName,
      orgSize,
      industry,
      answers:       enrichedAnswers,
      domainScores,
      overallScore,
      maturityStage,
    });

    console.log(`✅ Assessment submitted by user ${userId} — Score: ${overallScore}, Stage: ${maturityStage}`);

    return res.status(201).json({
      success: true,
      message: 'Assessment submitted successfully.',
      assessmentId:       assessment._id,
      overallScore,
      maturityStage,
      maturityStageDetails,
      domainScores,
    });

  } catch (error) {
    console.error('submitAssessment error:', error);
    return res.status(500).json({ success: false, message: 'Failed to submit assessment. Please try again.' });
  }
};

// ─────────────────────────────────────────────────────────
// GET /results/:id
// Returns scores + stage for a completed assessment
// ─────────────────────────────────────────────────────────

export const getAssessmentResults = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const assessment = await AssessmentResponse.findById(id).select('-answers');
    if (!assessment) {
      return res.status(404).json({ success: false, message: 'Assessment not found.' });
    }

    // Ensure user can only view their own assessments (unless admin)
    if (assessment.userId.toString() !== userId.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    // Enrich with maturity stage details
    const maturityStageDetails = MATURITY_STAGES.find(
      (s) => s.stage === assessment.maturityStage
    );

    return res.status(200).json({
      success: true,
      assessmentId:       assessment._id,
      orgName:            assessment.orgName,
      industry:           assessment.industry,
      overallScore:       assessment.overallScore,
      maturityStage:      assessment.maturityStage,
      maturityStageDetails,
      domainScores:       assessment.domainScores,
      reportGenerated:    assessment.reportGenerated,
      reportId:           assessment.reportId,
      completedAt:        assessment.completedAt,
    });

  } catch (error) {
    console.error('getAssessmentResults error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch assessment results.' });
  }
};

// ─────────────────────────────────────────────────────────
// POST /report/:id
// Triggers AI report generation for an assessment (idempotent)
// ─────────────────────────────────────────────────────────

export const generateReport = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    // 1. Load assessment
    const assessment = await AssessmentResponse.findById(id);
    if (!assessment) {
      return res.status(404).json({ success: false, message: 'Assessment not found.' });
    }

    if (assessment.userId.toString() !== userId.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    // 2. Return existing report if already generated
    if (assessment.reportGenerated && assessment.reportId) {
      const existingReport = await AssessmentReport.findById(assessment.reportId);
      if (existingReport) {
        return res.status(200).json({
          success: true,
          message: 'Report already generated.',
          report: existingReport,
        });
      }
    }

    // 3. Generate new AI report
    const reportContent = await generateMaturityReport({
      overallScore:  assessment.overallScore,
      maturityStage: assessment.maturityStage,
      domainScores:  assessment.domainScores,
      orgName:       assessment.orgName,
      industry:      assessment.industry,
    });

    // 4. Save report to DB
    const report = await AssessmentReport.create({
      assessmentResponseId: assessment._id,
      userId,
      overallScore:   assessment.overallScore,
      maturityStage:  assessment.maturityStage,
      domainScores:   assessment.domainScores,
      ...reportContent,
    });

    // 5. Update assessment to link the report
    await AssessmentResponse.findByIdAndUpdate(id, {
      reportGenerated: true,
      reportId:        report._id,
    });

    console.log(`✅ Report generated for assessment ${id}`);

    return res.status(201).json({
      success: true,
      message: 'AI Maturity Report generated successfully.',
      report,
    });

  } catch (error) {
    console.error('generateReport error:', error);
    return res.status(500).json({ success: false, message: 'Failed to generate report. Please try again.' });
  }
};

// ─────────────────────────────────────────────────────────
// GET /report/:id
// Fetch an existing AI report (by assessmentId or reportId)
// ─────────────────────────────────────────────────────────

export const getReport = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    // Try to find by assessmentResponseId first, then by _id
    let report = await AssessmentReport.findOne({ assessmentResponseId: id });
    if (!report) {
      report = await AssessmentReport.findById(id);
    }

    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found. Please generate the report first.',
      });
    }

    if (report.userId.toString() !== userId.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    return res.status(200).json({ success: true, report });

  } catch (error) {
    console.error('getReport error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch report.' });
  }
};

// ─────────────────────────────────────────────────────────
// GET /my-assessments
// Returns all assessments for the authenticated user
// ─────────────────────────────────────────────────────────

export const getUserAssessments = async (req, res) => {
  try {
    const userId = req.user._id;

    const assessments = await AssessmentResponse.find({ userId })
      .select('-answers')          // Don't return raw answers in list view
      .sort({ completedAt: -1 })   // Most recent first
      .limit(20);

    return res.status(200).json({
      success: true,
      count: assessments.length,
      assessments,
    });

  } catch (error) {
    console.error('getUserAssessments error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch assessments.' });
  }
};

// ─────────────────────────────────────────────────────────
// GET /admin/all  (Admin only)
// Returns all assessments across all users
// ─────────────────────────────────────────────────────────

export const getAllAssessmentsAdmin = async (req, res) => {
  try {
    const assessments = await AssessmentResponse.find()
      .select('-answers')
      .populate('userId', 'name email')
      .sort({ completedAt: -1 })
      .limit(100);

    // Compute aggregate stats
    const total         = assessments.length;
    const avgScore      = total > 0
      ? Math.round(assessments.reduce((s, a) => s + a.overallScore, 0) / total * 10) / 10
      : 0;
    const stageBreakdown = MATURITY_STAGES.map((s) => ({
      stage: s.stage,
      count: assessments.filter((a) => a.maturityStage === s.stage).length,
    }));

    return res.status(200).json({
      success: true,
      stats: { total, avgScore, stageBreakdown },
      assessments,
    });

  } catch (error) {
    console.error('getAllAssessmentsAdmin error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch assessments.' });
  }
};
