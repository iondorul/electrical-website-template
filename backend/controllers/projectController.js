const projectService = require("../services/projectService");
const { Errors } = require("../constants");

exports.getProjects = async (req, res) => {
  try {
    const result = await projectService.getAllProjects(req.user.id, req.query);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      error: Errors.SERVER_ERROR,
      message: "Error retrieving projects.",
    });
  }
};

exports.getProjectById = async (req, res) => {
  try {
    const project = await projectService.getProjectById(
      req.user.id,
      req.params.id,
    );
    if (!project)
      return res.status(404).json({
        success: false,
        error: Errors.PROJECT_NOT_FOUND,
        message: "Project not found.",
      });
    res.json(project);
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      error: Errors.SERVER_ERROR,
      message: "Error retrieving project.",
    });
  }
};

exports.createProject = async (req, res) => {
  try {
    if (!req.body.project_name || !req.body.client_id) {
      return res.status(400).json({
        success: false,
        error: Errors.PROJECT_NAME_AND_CLIENT_REQUIRED,
        message: "Project name and client are required.",
      });
    }
    const newProject = await projectService.createProject(
      req.user.id,
      req.body,
    );
    res.status(201).json(newProject);
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      error: Errors.SERVER_ERROR,
      message: err.message || "Error creating project.",
    });
  }
};

exports.updateProject = async (req, res) => {
  try {
    const updated = await projectService.updateProject(
      req.user.id,
      req.params.id,
      req.body,
    );
    if (!updated)
      return res.status(404).json({
        success: false,
        error: Errors.PROJECT_NOT_FOUND,
        message: "Project not found or has been deleted.",
      });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      error: Errors.SERVER_ERROR,
      message: err.message || "Error updating project.",
    });
  }
};

exports.deleteProject = async (req, res) => {
  try {
    const deleted = await projectService.softDeleteProject(
      req.user.id,
      req.params.id,
    );
    if (!deleted)
      return res.status(404).json({
        success: false,
        error: Errors.PROJECT_NOT_FOUND,
        message: "Project not found.",
      });
    res.json({
      success: true,
      message: "Project archived successfully.",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      error: Errors.SERVER_ERROR,
      message: "Error deleting project.",
    });
  }
};
