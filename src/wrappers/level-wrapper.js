import axios from 'axios';
import { transferTranslations } from "@/wrappers/translation-wrapper";

// query should be a string
const getLevels = async (query = "") => {
  try {
    const response = await axios.get(`/api/levels?${query}`);
    const list = Array.isArray(response.data) ? [...response.data] : [];

    // Fallback sort: numeric levels first ascending, then any non-numeric lexicographically.
    list.sort((a, b) => {
      const av = Number(a?.level);
      const bv = Number(b?.level);
      const aIsNum = !Number.isNaN(av);
      const bIsNum = !Number.isNaN(bv);
      if (aIsNum && bIsNum) return av - bv;
      if (aIsNum) return -1;
      if (bIsNum) return 1;
      return String(a?.level ?? "").localeCompare(String(b?.level ?? ""));
    });

    return list;
  } catch (error) {
    console.error('Error fetching levels:', error);
    throw error;
  }
}

const createLevel = async (levelData) => {
  levelData.skills = levelData.skills.map(skill => skill.toLowerCase());
  try {
    const response = await axios.post(`/api/levels/`, levelData);
    await transferTranslations();
    return response.data;
  } catch (error) {
    console.error('Error creating level:', error);
    throw error;
  }
}

const updateLevel = async (levelId, levelData) => {
  try {
    const response = await axios.put(`/api/levels/${levelId}`, levelData);
    await transferTranslations();
    return response.data;
  } catch (error) {
    console.error('Error updating level:', error);
    throw error;
  }
}

const deleteLevel = async (levelId) => {
  try {
    const response = await axios.delete(`/api/levels/${levelId}`);
    return response.data;
  } catch (error) {
    console.error('Error deleting level:', error);
    throw error;
  }
}

export {
  getLevels,
  createLevel,
  updateLevel,
  deleteLevel
}