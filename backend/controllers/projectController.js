const projectService = require("../services/projectService");

exports.getProjects = async (req, res) => {
  try {
    const result = await projectService.getAllProjects(req.user.id, req.query);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Eroare la preluarea proiectelor." });
  }
};

exports.getProjectById = async (req, res) => {
  try {
    const project = await projectService.getProjectById(
      req.user.id,
      req.params.id,
    );
    if (!project)
      return res.status(404).json({ message: "Proiectul nu a fost găsit." });
    res.json(project);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Eroare la preluarea proiectului." });
  }
};

exports.createProject = async (req, res) => {
  try {
    if (!req.body.project_name || !req.body.client_id) {
      return res
        .status(400)
        .json({ message: "Numele proiectului și clientul sunt obligatorii." });
    }
    const newProject = await projectService.createProject(
      req.user.id,
      req.body,
    );
    res.status(201).json(newProject);
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ message: err.message || "Eroare la crearea proiectului." });
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
      return res
        .status(404)
        .json({ message: "Proiectul nu a fost găsit sau a fost șters." });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ message: err.message || "Eroare la actualizarea proiectului." });
  }
};

exports.deleteProject = async (req, res) => {
  try {
    const deleted = await projectService.softDeleteProject(
      req.user.id,
      req.params.id,
    );
    if (!deleted)
      return res.status(404).json({ message: "Proiectul nu a fost găsit." });
    res.json({ message: "Proiectul a fost arhivat cu succes." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Eroare la ștergerea proiectului." });
  }
};
