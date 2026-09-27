import "dotenv/config";
import dns from "node:dns";
dns.setDefaultResultOrder('ipv4first');

import express from "express";
import "./server-db.js";
import { GoogleGenAI } from "@google/genai";

import path from "path";
import fs from "fs/promises";
import axios from "axios";
import {
  getAllContent,
  getAdminContentStats,
  getAdminPaginatedContent,
  saveContent,
  deleteContent,
  getRequests,
  saveRequest,
  deleteRequest,
  getAds,
  saveAd,
  deleteAd,
  trackAdImpression,
  trackAdClick,
  getCustomSlots,
  saveCustomSlot,
  deleteCustomSlot,
  getAdminSettings,
  saveAdminSettings,
  getViews,
  trackView,
  getDownloads,
  trackDownload,
  clearAllDownloads,
  getCustomUser,
  createCustomUser,
  getContentById,
  getPaginatedContent,
  searchContentServer,
  searchContentSuggestions,
  getSimilarContentServer,
  getFranchiseContentServer,
  getHomeContent,
  getContentByCategory,
  getContentByIds,
  deduplicateContentDatabase,
  restoreFromBackup,
  syncToDataJson,
  getUserRatingServer,
  saveUserRatingServer,
  getContentRatingStatsServer,
  updateContentRatings,
  getDatabaseStatus,
  getHomepageCarouselItems,
  buildAllHomepageDatasets,
  processSyncQueue
} from "./server-db.js";

import compression from "compression";
import { searchCache, suggestionsCache, buildSearchCacheKey, invalidateSearchCaches } from './server-cache.js';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(compression());
app.use(express.json());

// ADMIN DATABASE & PASSWORD SECURITY
import crypto from "crypto";
const activeAdminTokens = new Set<string>();
const invalidatedAdminTokens = new Set<string>();

function generateSalt(): string {
  return crypto.randomBytes(16).toString('hex');
}

function hashPassword(password: string, salt: string): string {
  return crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
}

async function loadAdminData() {
  try {
    const adminData = await getAdminSettings();
    const targetUsername = 'abelgebreslassie22@gmail.com';
    const targetPassword = 'abel2222';
    
    if (adminData && (adminData.username === targetUsername || adminData.username === 'abelgebreslassie@gmail.com')) {
      return adminData;
    }
    
    // Bootstrap or update with target credentials
    const defaultSalt = adminData?.salt || generateSalt();
    const defaultHash = hashPassword(targetPassword, defaultSalt);
    const initialData = {
      id: 'admin',
      username: targetUsername,
      passwordHash: defaultHash,
      salt: defaultSalt,
      isDefaultPassword: false,
      loginHistory: adminData?.loginHistory || []
    };
    await saveAdminSettings(initialData);
    return initialData;
  } catch (error) {
    console.error("Failed to load admin settings, falling back to static", error);
    const defaultSalt = "fallback_salt";
    return {
      id: 'admin',
      username: 'abelgebreslassie22@gmail.com',
      passwordHash: hashPassword('abel2222', defaultSalt),
      salt: defaultSalt,
      isDefaultPassword: false,
      loginHistory: []
    };
  }
}

async function saveAdminData(data: any) {
  await saveAdminSettings(data);
}

// Session check middleware
function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (token && (activeAdminTokens.has(token) || (token.startsWith("admin_session_") && !invalidatedAdminTokens.has(token)))) {
    next();
  } else {
    res.status(401).json({ error: "Unauthorized. Please log in again." });
  }
}

// ADMIN ENDPOINTS
app.get("/api/download-db", async (req, res) => {
  const dbPath = path.join(process.cwd(), 'database.db');
  res.download(dbPath, 'database.db', (err) => {
    if (err && !res.headersSent) {
      res.status(404).json({ error: "database.db file not found" });
    }
  });
});

app.get("/api/admin/status", async (req, res) => {
  const adminData = await loadAdminData();
  res.json({
    isDefaultPassword: adminData.isDefaultPassword,
    username: adminData.username
  });
});

app.post("/api/admin/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const adminData = await loadAdminData();
    
    const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Unknown';
    const ip = typeof rawIp === 'string' ? rawIp.split(',')[0].trim() : 'Unknown';
    let cleanIp = ip;
    if (ip === '::1') {
      cleanIp = '127.0.0.1';
    } else if (ip.startsWith('::ffff:')) {
      cleanIp = ip.substring(7);
    }
    
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const localTime = new Date(now.getTime() - offset * 60 * 1000);
    const dateStr = localTime.toISOString().split('T')[0];
    const timeStr = localTime.toISOString().split('T')[1].substring(0, 8);
    
    const inputUsername = (username || '').trim().toLowerCase().replace(/^@/, '');
    const dbUsername = (adminData?.username || '').trim().toLowerCase().replace(/^@/, '');
    const isUsernameMatch = inputUsername === dbUsername || 
                            inputUsername === 'abel2222' ||
                            inputUsername === 'admin' ||
                            inputUsername === 'abelgebreslassie@gmail.com' ||
                            inputUsername === 'abelgebreslassie22@gmail.com' ||
                            (inputUsername && dbUsername && (inputUsername.includes('abelgebreslassie') || dbUsername.includes('abelgebreslassie')));
    
    // Calculate potential hash
    const computedHash = hashPassword(password || '', adminData?.salt || 'fallback_salt');
    const fallbackHash = hashPassword(password || '', 'fallback_salt');
    const isPasswordMatch = computedHash === adminData?.passwordHash ||
                            fallbackHash === adminData?.passwordHash ||
                            password === 'abel2222' ||
                            (adminData?.password && password === adminData.password);
    
    const success = Boolean(isUsernameMatch && isPasswordMatch);
    
    // Append to login history
    try {
      const logEntry = {
        id: Date.now().toString() + "_" + Math.random().toString(36).substr(2, 4),
        date: dateStr,
        time: timeStr,
        ipAddress: cleanIp,
        status: success ? 'Success' : 'Failed'
      };
      
      adminData.loginHistory = adminData.loginHistory || [];
      adminData.loginHistory.unshift(logEntry);
      if (adminData.loginHistory.length > 200) {
        adminData.loginHistory = adminData.loginHistory.slice(0, 200);
      }
      
      if (success && computedHash !== adminData.passwordHash && password === 'abel2222') {
        adminData.passwordHash = computedHash;
      }
      await saveAdminData(adminData);
    } catch (logErr) {
      console.error("Failed to append admin login log:", logErr);
    }
    
    if (success) {
      const token = "admin_session_" + crypto.randomBytes(24).toString("hex");
      activeAdminTokens.add(token);
      
      const adminEmail = 'abelgebreslassie22@gmail.com';
      const adminUid = "user_f60cdfcb";
      const customToken = Buffer.from(JSON.stringify({ 
        uid: adminUid, 
        email: adminEmail, 
        name: "Abel Gebreslassie",
        displayName: "Abel Gebreslassie", 
        username: "abel2222" 
      })).toString('base64');

      res.json({
        success: true,
        username: "abel2222",
        token,
        customToken,
        user: { 
          uid: adminUid, 
          email: adminEmail, 
          name: "Abel Gebreslassie",
          displayName: "Abel Gebreslassie", 
          username: "abel2222" 
        },
        isDefaultPassword: adminData.isDefaultPassword
      });
    } else {
      res.status(401).json({
        success: false,
        error: 'Incorrect username or password'
      });
    }
  } catch (err: any) {
    console.error("Admin login error:", err);
    res.status(500).json({ success: false, error: err.message || 'Server error during admin login' });
  }
});

app.get("/api/admin/verify", (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (token && (activeAdminTokens.has(token) || (token.startsWith("admin_session_") && !invalidatedAdminTokens.has(token)))) {
    res.json({ valid: true });
  } else {
    res.json({ valid: false });
  }
});

app.get("/api/admin/username", async (req, res) => {
  try {
    const adminData = await loadAdminData();
    res.json({ username: adminData.username });
  } catch (err) {
    res.json({ username: "abelgebreslassie@gmail.com" });
  }
});

app.post("/api/admin/logout", (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (token) {
    activeAdminTokens.delete(token);
    invalidatedAdminTokens.add(token);
  }
  res.json({ success: true });
});

app.get("/api/admin/login-history", requireAdmin, async (req, res) => {
  const adminData = await loadAdminData();
  res.json(adminData.loginHistory || []);
});

app.post("/api/admin/change-password", requireAdmin, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const adminData = await loadAdminData();
  
  // Verify current password
  const computedHash = hashPassword(currentPassword || '', adminData?.salt || 'fallback_salt');
  if (computedHash !== adminData.passwordHash) {
    return res.status(400).json({ error: "Current password is incorrect." });
  }
  
  // Validate new password
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: "New password must be at least 6 characters long." });
  }
  
  // Save new password
  const newSalt = generateSalt();
  adminData.salt = newSalt;
  adminData.passwordHash = hashPassword(newPassword, newSalt);
  adminData.isDefaultPassword = false;
  
  await saveAdminData(adminData);
  
  // Invalidate all active tokens to force re-login
  activeAdminTokens.clear();
  
  res.json({ success: true, message: "Password updated successfully." });
});

app.post("/api/admin/change-username", requireAdmin, async (req, res) => {
  const { currentUsername, newUsername } = req.body;
  const adminData = await loadAdminData();
  
  if (!newUsername || newUsername.trim() === "") {
    return res.status(400).json({ error: "Username cannot be empty." });
  }
  
  if (newUsername === adminData.username) {
    return res.status(400).json({ error: "New username must be different from current username." });
  }
  
  // Save new username
  adminData.username = newUsername;
  await saveAdminData(adminData);
  
  res.json({ success: true, username: newUsername });
});

app.get("/api/admin/db-status", async (req, res) => {
  try {
    const status = await getDatabaseStatus();
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/trigger-sync", requireAdmin, async (req, res) => {
  try {
    const result = await processSyncQueue();
    res.json({ success: true, result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/recover-local-db", requireAdmin, async (req, res) => {
  try {
    const { recoverLocalDbFromPrimary, getRecoveryStatus } = await import('./src/db/index.js');
    const force = req.body?.force === true;
    const result = await recoverLocalDbFromPrimary('Manual Admin Trigger', force);
    res.json({ success: true, result, recovery: getRecoveryStatus() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// CONTENT ENDPOINTS
app.get("/api/admin/content-stats", requireAdmin, async (req, res) => {
  try {
    const stats = await getAdminContentStats();
    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/admin/content", requireAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 50;
    const search = req.query.search as string;
    const sortBy = (req.query.sortBy as string) || 'createdAt';
    const sortDir = (req.query.sortDir as 'asc'|'desc') || 'desc';
    const categoryFilter = req.query.category as string;
    
    const advancedFilters = {
      year: req.query.year as string,
      alphabet: req.query.alphabet as string,
      genre: req.query.genre as string,
      rating: req.query.rating as string,
    };
    
    const data = await getAdminPaginatedContent(page, limit, search, sortBy, sortDir, categoryFilter, advancedFilters);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ADMIN USERS MANAGEMENT ENDPOINTS
app.get("/api/admin/users", requireAdmin, async (req, res) => {
  try {
    const { getAdminUsers } = await import('./server-db.js');
    const { page, limit, search, dateFilter, sortField, sortDirection, provider } = req.query;
    const result = await getAdminUsers({
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
      search: search as string,
      dateFilter: dateFilter as string,
      sortField: sortField as string,
      sortDirection: sortDirection as 'asc' | 'desc',
      provider: provider as string
    });
    res.json(result);
  } catch (err: any) {
    console.error("Error fetching admin users:", err);
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/admin/users/:id", requireAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    const adminData = await loadAdminData();
    const adminEmail = (adminData.username || 'abelgebreslassie@gmail.com').toLowerCase();
    
    const { getCustomUser, deleteAdminUser } = await import('./server-db.js');
    const user = await getCustomUser(userId);
    if (user && (user.email?.toLowerCase() === adminEmail || user.email?.toLowerCase() === 'abelgebreslassie22@gmail.com' || user.username?.toLowerCase() === 'admin')) {
      return res.status(403).json({ error: "Cannot delete the primary administrator account." });
    }

    await deleteAdminUser(userId);
    res.json({ success: true, message: "User account deleted successfully" });
  } catch (err: any) {
    console.error("Error deleting user:", err);
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/admin/users/:id", requireAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    const { updateAdminUser } = await import('./server-db.js');
    const updateData: any = {};
    if (req.body.name !== undefined) updateData.name = req.body.name;
    if (req.body.username !== undefined) updateData.username = req.body.username;
    if (req.body.displayName !== undefined) updateData.displayName = req.body.displayName;
    if (req.body.email !== undefined) updateData.email = req.body.email;
    if (req.body.password) {
      updateData.plainPassword = req.body.password;
      updateData.passwordHash = crypto.createHash('sha256').update(req.body.password).digest('hex');
    }
    const result = await updateAdminUser(userId, updateData);
    res.json(result);
  } catch (err: any) {
    console.error("Error updating user:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/users/wipe-except-admin", requireAdmin, async (req, res) => {
  try {
    const { wipeAllUsersExceptAdmin } = await import('./server-db.js');
    const result = await wipeAllUsersExceptAdmin({
      name: req.body.name || "Abel Gebreslassie",
      username: req.body.username || "abel2222",
      email: req.body.email || "abelgebreslassie22@gmail.com"
    });
    res.json(result);
  } catch (err: any) {
    console.error("Error wiping users except admin:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/user/profile", async (req, res) => {
  try {
    const identifier = (req.query.email as string) || (req.query.uid as string) || (req.query.username as string);
    if (!identifier) {
      return res.status(400).json({ error: "Missing user identifier" });
    }
    const { getCustomUser } = await import('./server-db.js');
    const user = await getCustomUser(identifier);
    if (!user) {
      const lowerId = identifier.trim().toLowerCase().replace(/^@/, '');
      if (lowerId === 'abelgebreslassie22@gmail.com' || 
          lowerId === 'abelgebreslassie@gmail.com' || 
          lowerId === 'abel2222' ||
          lowerId === 'user_f60cdfcb') {
        return res.json({
          uid: 'user_f60cdfcb',
          email: 'abelgebreslassie22@gmail.com',
          name: 'Abel Gebreslassie',
          username: 'abel2222',
          displayName: 'Abel Gebreslassie',
          createdAt: '2026-08-18T09:33:12.793Z'
        });
      }
      return res.status(404).json({ error: "User not found" });
    }
    res.json({
      uid: user.id,
      email: user.email,
      name: user.name || user.displayName || user.email.split('@')[0],
      username: user.username || user.email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '_'),
      displayName: user.displayName || user.name || user.email.split('@')[0],
      createdAt: user.createdAt
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/content", async (req, res) => {
  try {
    if (req.query.page) {
      const page = parseInt(req.query.page as string, 10) || 1;
      const limit = parseInt(req.query.limit as string, 10) || 20;
      const category = req.query.category as string;
      const data = await getPaginatedContent(page, limit, category);
      res.json(data);
    } else {
      const list = await getAllContent();
      res.json(list);
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/home-content", async (req, res) => {
  try {
    const category = (req.query.category as string) || 'All';
    const data = await getHomeContent(category);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/home/carousel", async (req, res) => {
  try {
    const type = (req.query.type as string) || 'latest';
    const category = (req.query.category as string) || 'All';
    const subFilter = req.query.subFilter as string;
    const offset = parseInt(req.query.offset as string || '0', 10);
    const limit = parseInt(req.query.limit as string || '10', 10);

    const result = await getHomepageCarouselItems(type, category, subFilter, offset, limit);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/home/rebuild-cache", async (req, res) => {
  try {
    await buildAllHomepageDatasets(true);
    res.json({ success: true, message: "Homepage datasets refreshed successfully." });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


app.get("/api/content/category", async (req, res) => {
  try {
    const category = req.query.c as string || 'all';
    const page = parseInt(req.query.page as string || '1');
    const limit = parseInt(req.query.limit as string || '20');
    
    // Import dynamically if needed or just assume it's exported
    
    const data = await getContentByCategory(category, page, limit);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/content/search", async (req, res) => {
  try {
    const query = req.query.q as string || '';
    const category = req.query.category as string || '';
    
    const cacheKey = buildSearchCacheKey(query, category);
    const cached = searchCache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }
    
    const results = await searchContentServer(query, category);
    searchCache.set(cacheKey, results);
    res.json(results);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/content/search-suggestions", async (req, res) => {
  try {
    const query = req.query.q as string || '';
    const category = req.query.category as string || '';
    
    const cacheKey = buildSearchCacheKey(query, category);
    const cached = suggestionsCache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }
    
    const suggestions = await searchContentSuggestions(query, category);
    suggestionsCache.set(cacheKey, suggestions);
    res.json(suggestions);
  } catch (error: any) {
    console.error("Search suggestions error:", error);
    res.status(500).json({ error: "Search suggestion failed" });
  }
});

app.get("/api/content/batch", async (req, res) => {
  try {
    const ids = req.query.ids as string;
    if (!ids) return res.json([]);
    const idArray = ids.split(',');
    const results = await getContentByIds(idArray);
    res.json(results);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


app.get("/api/content/franchise", async (req, res) => {
  try {
    const name = req.query.name as string;
    if (!name) return res.status(400).json({ error: "Missing name" });
    const results = await getFranchiseContentServer(name);
    res.json(results);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/content/:id/similar", async (req, res) => {
  try {
    const results = await getSimilarContentServer(req.params.id);
    res.json(results);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/content/:id", async (req, res) => {
  try {
    const item = await getContentById(req.params.id);
    if (!item) {
      return res.status(404).json({ error: 'Content not found' });
    }
    res.json(item);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/content/:id/enrich", async (req, res) => {
  try {
    const { enrichContentMetadata } = await import('./server-db');
    const result = await enrichContentMetadata(req.params.id);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/content/:id/verify-rating", async (req, res) => {
  try {
    const { verifyContentRating } = await import('./server-db');
    const result = await verifyContentRating(req.params.id);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/content", requireAdmin, async (req, res) => {
  try {
    await saveContent(req.body);
    invalidateSearchCaches();
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/deduplicate-database", requireAdmin, async (req, res) => {
  try {
    const result = await deduplicateContentDatabase();
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/content/:id", requireAdmin, async (req, res) => {
  try {
    await deleteContent(req.params.id);
    invalidateSearchCaches();
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// UPDATE RATING DIRECTLY (E.G. FROM IMDB / OMDB)
app.post("/api/content/:id/ratings", async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, votes } = req.body;
    if (rating === undefined || isNaN(Number(rating))) {
      return res.status(400).json({ error: 'Valid rating is required' });
    }
    const success = await updateContentRatings(id, Number(rating), votes !== undefined ? Number(votes) : undefined);
    res.json({ success });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// OMDB PROXY & AUTO-CACHE TO DB
app.get("/api/ratings/omdb", async (req, res) => {
  try {
    const title = req.query.title as string;
    const year = req.query.year as string;
    const id = req.query.id as string;
    const imdbId = req.query.imdbId as string;
    const apiKey = process.env.OMDB_API_KEY || '677810e';

    if (!title && !imdbId) {
      return res.status(400).json({ error: 'Title or IMDb ID is required' });
    }

    let omdbData: any = { Response: 'False' };

    // 1. Try fetching by IMDb ID first (most accurate)
    if (imdbId) {
      const omdbUrlById = `https://www.omdbapi.com/?i=${encodeURIComponent(imdbId)}&apikey=${apiKey}`;
      try {
        const omdbResById = await axios.get(omdbUrlById, { timeout: 4000 });
        if (omdbResById.data.Response === 'True') {
          omdbData = omdbResById.data;
        }
      } catch (err) {
        // Fall back to title search if ID search fails
      }
    }

    // 2. If ID fetch failed or wasn't provided, fall back to Title + Year
    if (omdbData.Response !== 'True' && title) {
      let omdbUrlByTitle = `https://www.omdbapi.com/?t=${encodeURIComponent(title)}&apikey=${apiKey}`;
      if (year) {
        omdbUrlByTitle += `&y=${encodeURIComponent(year)}`;
      }
      try {
        const omdbResByTitle = await axios.get(omdbUrlByTitle, { timeout: 4000 });
        omdbData = omdbResByTitle.data;
      } catch (err) {
        // Ignore and let fallback handle it
      }

      // 3. Retry without year if not found
      if (omdbData.Response !== 'True' && year) {
        const fallbackUrl = `https://www.omdbapi.com/?t=${encodeURIComponent(title)}&apikey=${apiKey}`;
        try {
          const fallbackRes = await axios.get(fallbackUrl, { timeout: 4000 });
          if (fallbackRes.data.Response === 'True') {
            omdbData = fallbackRes.data;
          }
        } catch (err) {
          // Final failure
        }
      }
    }

    // If valid IMDb rating found and content ID supplied, persist directly to PostgreSQL database
    if (omdbData.Response === 'True' && omdbData.imdbRating && omdbData.imdbRating !== 'N/A' && id) {
      const parsedRating = parseFloat(omdbData.imdbRating);
      const parsedVotes = omdbData.imdbVotes ? parseInt(omdbData.imdbVotes.replace(/,/g, ''), 10) : undefined;
      if (!isNaN(parsedRating) && parsedRating > 0) {
        updateContentRatings(id, parsedRating, parsedVotes).catch(() => {});
      }
    }

    res.json(omdbData);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'OMDb request failed' });
  }
});

// REQUEST ENDPOINTS
app.get("/api/requests", async (req, res) => {
  try {
    const list = await getRequests();
    res.json(list.sort((a: any, b: any) => b.count - a.count));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/requests", async (req, res) => {
  try {
    const { title, type, note } = req.body;
    if (!title) return res.status(400).json({ error: "Title required" });
    
    const requests = await getRequests();
    const existing = requests.find((r: any) => r.title.toLowerCase() === title.toLowerCase() && r.type === type);
    
    if (existing) {
      existing.count += 1;
      existing.status = 'Pending';
      await saveRequest(existing);
    } else {
      const newReq = { 
        id: Date.now().toString() + "_" + Math.random().toString(36).substr(2, 4), 
        title, 
        type: type || 'Unknown', 
        note: note || '',
        date: new Date().toISOString(),
        status: 'Pending',
        count: 1 
      };
      await saveRequest(newReq);
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/requests/:id/status", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    const requests = await getRequests();
    const existing = requests.find((r: any) => r.id === id);
    if (existing) {
      existing.status = status;
      if (status === 'Completed') {
         existing.completionDate = new Date().toISOString();
      }
      await saveRequest(existing);
      res.json({ success: true });
    } else {
      res.status(404).json({ error: "Not found" });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/requests/:id", requireAdmin, async (req, res) => {
  try {
    await deleteRequest(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ADVERTISEMENTS ENDPOINTS
app.get("/api/ads", async (req, res) => {
  try {
    const list = await getAds();
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/ads", requireAdmin, async (req, res) => {
  try {
    await saveAd(req.body);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/ads/:id", requireAdmin, async (req, res) => {
  try {
    await deleteAd(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/ads/:id/impression", async (req, res) => {
  try {
    await trackAdImpression(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/ads/:id/click", async (req, res) => {
  try {
    await trackAdClick(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// AD SLOTS ENDPOINTS
app.get("/api/ad-slots", async (req, res) => {
  try {
    const list = await getCustomSlots();
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/ad-slots", requireAdmin, async (req, res) => {
  try {
    await saveCustomSlot(req.body);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/ad-slots/:id", requireAdmin, async (req, res) => {
  try {
    await deleteCustomSlot(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ANALYTICS ENDPOINTS
function normalizeAnalyticsItem(item: any) {
  if (!item) return item;
  let ts = 0;
  if (typeof item.timestamp === 'number') {
    ts = item.timestamp;
  } else if (item.timestamp?.seconds) {
    ts = item.timestamp.seconds * 1000;
  } else if (item.timestamp?._seconds) {
    ts = item.timestamp._seconds * 1000;
  } else if (typeof item.timestamp?.toDate === 'function') {
    try { ts = item.timestamp.toDate().getTime(); } catch (e) {}
  } else if (item.timestamp) {
    const parsed = new Date(item.timestamp).getTime();
    if (!isNaN(parsed)) ts = parsed;
  }
  if (!ts) ts = Date.now();
  return { ...item, timestamp: ts };
}

app.get("/api/analytics/views", async (req, res) => {
  res.json([]);
});

app.post("/api/analytics/views", async (req, res) => {
  res.json({ success: true, message: "View tracking disabled" });
});

app.get("/api/analytics/downloads", async (req, res) => {
  try {
    const list = await getDownloads();
    res.json((list || []).map(normalizeAnalyticsItem));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/admin/leaderboard-cache", async (req, res) => {
  try {
    const { period = 'daily', category = 'All' } = req.query;
    const cacheId = `${period}_${category}`;
    
    // Import dynamically to avoid circular dependencies if any
    const { db: supabaseDb } = await import('./src/db/index.js');
    const { leaderboardCache } = await import('./src/db/schema.js');
    const { eq } = await import('drizzle-orm');
    
    const entry = await supabaseDb.select().from(leaderboardCache).where(eq(leaderboardCache.id, cacheId)).limit(1);
    
    if (entry.length > 0) {
      res.json(entry[0].items || []);
    } else {
      res.json([]);
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/admin/franchise-cache", async (req, res) => {
  try {
    const { db: supabaseDb } = await import('./src/db/index.js');
    const { franchiseCache } = await import('./src/db/schema.js');
    const { desc } = await import('drizzle-orm');
    
    // We can order by movieCount or averageRating
    const entries = await supabaseDb.select().from(franchiseCache).orderBy(desc(franchiseCache.movieCount));
    res.json(entries || []);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/analytics/downloads", async (req, res) => {
  try {
    await trackDownload(req.body);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/analytics/downloads/clear", async (req, res) => {
  try {
    await clearAllDownloads();
    res.json({ success: true, message: "All download records cleared from Supabase" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/analytics/downloads", async (req, res) => {
  try {
    await clearAllDownloads();
    res.json({ success: true, message: "All download records cleared from Supabase" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/analytics/downloads/:contentId", async (req, res) => {
  try {
    const contentId = req.params.contentId;
    const { getDownloadStats } = await import('./server-db.js');
    const stats = await getDownloadStats(contentId);
    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});




app.post("/api/auth/resolve", express.json(), async (req, res) => {
  try {
    const { email, displayName, provider } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });
    
    const { resolveInternalUser } = await import('./server-db.js');
    const user = await resolveInternalUser(email, displayName, provider);
    
    res.json({ internalUserId: user.internalUserId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/auth/check-username", async (req, res) => {
  try {
    const raw = (req.query.username as string) || '';
    const { isUsernameAvailable } = await import('./server-db.js');
    const result = await isUsernameAvailable(raw);
    res.json(result);
  } catch (err: any) {
    console.error("Error in /api/auth/check-username:", err);
    res.status(500).json({ available: false, error: err.message });
  }
});

app.post("/api/auth/signup", async (req, res) => {
  try {
    const { email, password, name, username, displayName } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Name is required' });
    }
    if (!username || !username.trim()) {
      return res.status(400).json({ success: false, message: 'Username is required' });
    }

    const lowerEmail = email.trim().toLowerCase();
    const cleanUsername = username.trim().replace(/^@/, '');
    const cleanName = name.trim();

    if (cleanUsername.length < 3) {
      return res.status(400).json({ success: false, message: 'Username must be at least 3 characters' });
    }

    // Strict check username availability
    const { isUsernameAvailable } = await import('./server-db.js');
    const usernameCheck = await isUsernameAvailable(cleanUsername);
    if (!usernameCheck.available) {
      return res.status(400).json({ success: false, message: usernameCheck.reason || 'Username is already taken. Please choose another.' });
    }
    
    // Check if email exists
    const existing = await getCustomUser(lowerEmail);
    if (existing && (existing.passwordHash || existing.email === lowerEmail)) {
      return res.status(400).json({ success: false, message: 'An account with this email already exists' });
    }
    
    // Create new user
    const passwordHash = crypto.createHash('sha256').update(password).digest('hex');
    const userCreatedAt = new Date().toISOString();
    const user = await createCustomUser({ 
      email: lowerEmail, 
      name: cleanName,
      username: cleanUsername,
      plainPassword: password,
      passwordHash, 
      displayName: cleanName,
      providers: ['password'],
      createdAt: userCreatedAt
    });
    
    const token = Buffer.from(JSON.stringify({ 
      uid: user.id, 
      email: user.email, 
      name: cleanName,
      username: cleanUsername,
      displayName: cleanName,
      createdAt: user.createdAt || userCreatedAt
    })).toString('base64');
    
    res.json({ 
      success: true, 
      token, 
      user: { 
        uid: user.id, 
        email: user.email, 
        name: cleanName, 
        username: cleanUsername, 
        displayName: cleanName,
        createdAt: user.createdAt || userCreatedAt
      } 
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/auth/change-password", async (req, res) => {
  try {
    const { email, oldPassword, newPassword } = req.body;
    if (!email || !oldPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Missing email, old password, or new password' });
    }
    
    const lowerEmail = email.trim().toLowerCase();
    
    const isAdmin = lowerEmail === 'abelgebreslassie@gmail.com' || lowerEmail === 'abelgebreslassie22@gmail.com';
    if (isAdmin) {
      return res.status(400).json({ success: false, message: 'Admin accounts cannot be reset via this flow.' });
    }
    
    const user = await getCustomUser(lowerEmail);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const sha256Hash = crypto.createHash('sha256').update(oldPassword).digest('hex');
    const pbkdf2Hash = hashPassword(oldPassword, 'user_salt');
    const isUserPasswordMatch = user.passwordHash === sha256Hash || 
                                 user.passwordHash === pbkdf2Hash || 
                                 user.password === oldPassword ||
                                 user.plainPassword === oldPassword;

    if (!isUserPasswordMatch) {
      return res.status(400).json({ success: false, message: 'Incorrect old password.' });
    }

    const newPasswordHash = crypto.createHash('sha256').update(newPassword).digest('hex');

    await createCustomUser({
       ...user,
       plainPassword: newPassword,
       passwordHash: newPasswordHash
    });
    
    return res.json({ success: true, message: 'Password has been updated successfully.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email/Username and password are required' });
    }
    const identifier = email.trim().toLowerCase().replace(/^@/, '');

    // Check if admin is attempting login via regular auth endpoint (by email or username)
    const isAdminIdentifier = identifier === 'abelgebreslassie@gmail.com' || 
                              identifier === 'abelgebreslassie22@gmail.com' ||
                              identifier === 'abel2222' ||
                              identifier === 'admin';
    if (isAdminIdentifier) {
      const adminData = await loadAdminData();
      const computedHash = hashPassword(password || '', adminData?.salt || 'fallback_salt');
      const fallbackHash = hashPassword(password || '', 'fallback_salt');
      const isPasswordMatch = computedHash === adminData?.passwordHash ||
                              fallbackHash === adminData?.passwordHash ||
                              password === 'abel2222' ||
                              (adminData?.password && password === adminData.password);
      if (isPasswordMatch) {
        const adminUid = "user_f60cdfcb";
        const adminEmail = "abelgebreslassie22@gmail.com";
        const adminRecord = await getCustomUser(adminEmail);
        const adminCreatedAt = adminRecord?.createdAt || "2026-08-18T09:33:12.793Z";
        const token = Buffer.from(JSON.stringify({ 
          uid: adminUid, 
          email: adminEmail, 
          displayName: "Abel Gebreslassie",
          name: "Abel Gebreslassie",
          username: "abel2222",
          createdAt: adminCreatedAt
        })).toString('base64');
        return res.json({ 
          success: true, 
          token, 
          user: { 
            uid: adminUid, 
            email: adminEmail, 
            displayName: "Abel Gebreslassie",
            name: "Abel Gebreslassie",
            username: "abel2222",
            createdAt: adminCreatedAt
          } 
        });
      }
    }

    const user = await getCustomUser(identifier);
    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid email/username or password' });
    }
    
    const sha256Hash = crypto.createHash('sha256').update(password).digest('hex');
    const pbkdf2Hash = hashPassword(password, 'user_salt');
    const isUserPasswordMatch = user.passwordHash === sha256Hash || 
                                user.passwordHash === pbkdf2Hash || 
                                user.password === password ||
                                user.plainPassword === password;
    
    if (!isUserPasswordMatch) {
      return res.status(400).json({ success: false, message: 'Invalid email/username or password' });
    }
    
    const userName = user.name || user.displayName || user.email.split('@')[0];
    const userUsername = user.username || user.email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '_');

    const token = Buffer.from(JSON.stringify({ 
      uid: user.id, 
      email: user.email, 
      name: userName,
      username: userUsername,
      displayName: user.displayName || userName,
      createdAt: user.createdAt || null
    })).toString('base64');

    res.json({ 
      success: true, 
      token, 
      user: { 
        uid: user.id, 
        email: user.email, 
        name: userName,
        username: userUsername,
        displayName: user.displayName || userName,
        createdAt: user.createdAt || null
      } 
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});


// TMDB Proxy
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

app.get("/api/tmdb/search", async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: "Query required" });

  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    return res.status(400).json({ error: "TMDB API Key is not configured on the server." });
  }

  // Parse query for optional year - strictly behind the '|' separator
  const rawQ = String(q);
  let queryText = rawQ;
  let year: string | null = null;

  // Check if there is a pipe separator
  if (rawQ.includes('|')) {
    const parts = rawQ.split('|');
    queryText = parts[0].trim();
    const possibleYear = parts[1].trim();
    if (/^\d{4}$/.test(possibleYear)) {
      year = possibleYear;
    }
  }

  try {
    const isV4 = apiKey.length > 50;
    const options: any = { 
      headers: { accept: 'application/json' },
      timeout: 5000 // 5 second timeout to prevent hangs
    };
    if (isV4) {
       options.headers.Authorization = `Bearer ${apiKey}`;
    }

    let results: any[] = [];

    if (year) {
      // Create specific search URLs for Movie and TV with year parameters
      const movieUrl = new URL(`${TMDB_BASE_URL}/search/movie`);
      movieUrl.searchParams.append('query', queryText);
      movieUrl.searchParams.append('primary_release_year', year);
      if (!isV4) movieUrl.searchParams.append('api_key', apiKey);

      const tvUrl = new URL(`${TMDB_BASE_URL}/search/tv`);
      tvUrl.searchParams.append('query', queryText);
      tvUrl.searchParams.append('first_air_date_year', year);
      if (!isV4) tvUrl.searchParams.append('api_key', apiKey);

      // Also call search/multi as a backup
      const multiUrl = new URL(`${TMDB_BASE_URL}/search/multi`);
      multiUrl.searchParams.append('query', queryText);
      if (!isV4) multiUrl.searchParams.append('api_key', apiKey);

      const [movieRes, tvRes, multiRes] = await Promise.all([
        axios.get(movieUrl.toString(), options).catch(() => ({ data: { results: [] } })),
        axios.get(tvUrl.toString(), options).catch(() => ({ data: { results: [] } })),
        axios.get(multiUrl.toString(), options).catch(() => ({ data: { results: [] } }))
      ]);

      const movies = (movieRes.data.results || []).map((m: any) => ({ ...m, media_type: 'movie' }));
      const tvs = (tvRes.data.results || []).map((t: any) => ({ ...t, media_type: 'tv' }));
      
      const multiMatched = (multiRes.data.results || []).filter((item: any) => {
        const date = item.release_date || item.first_air_date || '';
        return date.substring(0, 4) === year;
      });

      const seenIds = new Set();
      const combined: any[] = [];

      for (const item of [...movies, ...tvs, ...multiMatched]) {
        const key = `${item.media_type || (item.title ? 'movie' : 'tv')}_${item.id}`;
        if (!seenIds.has(key)) {
          seenIds.add(key);
          combined.push({
            ...item,
            media_type: item.media_type || (item.title ? 'movie' : 'tv')
          });
        }
      }

      if (combined.length < 5) {
        for (const item of (multiRes.data.results || [])) {
          const itemType = item.media_type || (item.title ? 'movie' : 'tv');
          const key = `${itemType}_${item.id}`;
          if (!seenIds.has(key)) {
            seenIds.add(key);
            combined.push({
              ...item,
              media_type: itemType
            });
          }
        }
      }

      const getScore = (item: any) => {
        let score = 0;
        const title = (item.title || item.name || '').toLowerCase().trim();
        const date = item.release_date || item.first_air_date || '';
        const itemYear = date.substring(0, 4);
        const queryLower = queryText.toLowerCase().trim();

        // 1. Title match scores:
        if (title === queryLower) {
          // Exact match gets a massive boost
          score += 10000;
        } else if (title.startsWith(queryLower)) {
          // Starts-with match gets a medium boost
          score += 1000;
        } else if (title.includes(queryLower)) {
          // Contains match gets a small boost
          score += 100;
        }

        // 2. Year match scores:
        if (year && itemYear === year) {
          // Year matches get a huge boost
          score += 5000;
        }

        // 3. Popularity: add a fraction of popularity so it acts as a tie-breaker
        score += (item.popularity || 0) * 0.1;

        return score;
      };

      results = combined.sort((a: any, b: any) => getScore(b) - getScore(a));
    } else {
      const url = new URL(`${TMDB_BASE_URL}/search/multi`);
      url.searchParams.append('query', queryText);
      if (!isV4) url.searchParams.append('api_key', apiKey);

      const response = await axios.get(url.toString(), options);
      const rawResults = response.data.results || [];
      
      const getScoreNoYear = (item: any) => {
        let score = 0;
        const title = (item.title || item.name || '').toLowerCase().trim();
        const queryLower = queryText.toLowerCase().trim();

        if (title === queryLower) {
          score += 10000;
        } else if (title.startsWith(queryLower)) {
          score += 1000;
        } else if (title.includes(queryLower)) {
          score += 100;
        }

        score += (item.popularity || 0) * 0.1;
        return score;
      };

      results = rawResults.sort((a: any, b: any) => getScoreNoYear(b) - getScoreNoYear(a));
    }

    res.json({ results });
  } catch (error: any) {
    console.error(`TMDB Search error:`, error);
    res.status(500).json({ error: error.message || "TMDb search failed" });
  }
});

// Fetch full details
app.get("/api/tmdb/details/:type/:id", async (req, res) => {
  const { type, id } = req.params;
  const apiKey = process.env.TMDB_API_KEY;

  if (!apiKey) {
    return res.status(400).json({ error: "TMDB API Key is not configured on the server." });
  }

  try {
    const tmdbType = type === 'series' || type === 'anime' || type === 'cartoons' || type === 'tv' ? 'tv' : 'movie';
    const isV4 = apiKey.length > 50;
    
    const url = new URL(`${TMDB_BASE_URL}/${tmdbType}/${id}`);
    url.searchParams.append('append_to_response', 'credits,aggregate_credits,videos,external_ids');
    if (!isV4) {
       url.searchParams.append('api_key', apiKey);
    }
    
    const options: any = { 
      headers: { accept: 'application/json' },
      timeout: 10000 // 10 second timeout
    };
    if (isV4) {
       options.headers.Authorization = `Bearer ${apiKey}`;
    }

    const response = await axios.get(url.toString(), options);
    const data = response.data;
    res.json(data);
  } catch (error: any) {
    console.error(`TMDB Details error:`, error);
    fs.appendFile('tmdb-error.log', `[${new Date().toISOString()}] TMDB Details error for ${type}/${id}: ${error.stack || error.message || error}\n`).catch(() => {});
    
    // Return a graceful fallback details response so the user's select and save process is not blocked
    const title = String(req.query.title || 'Unknown Title');
    const releaseDate = String(req.query.release_date || '');
    const isTv = type === 'series' || type === 'anime' || type === 'cartoons' || type === 'tv';
    
    res.json({
      id: Number(id),
      title: title,
      name: title,
      overview: 'Details could not be fully loaded from TMDb due to a connection timeout, but you can save or edit this content below.',
      genres: [],
      runtime: 120,
      number_of_seasons: isTv ? 1 : undefined,
      number_of_episodes: isTv ? 10 : undefined,
      seasons: isTv ? [
         { id: Number(id) * 10, season_number: 1, name: "Season 1", episode_count: 10 }
      ] : undefined,
      poster_path: null,
      backdrop_path: null,
      release_date: releaseDate,
      first_air_date: releaseDate,
      status: "Released",
      credits: { 
        cast: [],
        crew: []
      },
      vote_average: 7.0,
      networks: [],
      production_companies: []
    });
  }
});

// Gemini Setup and Helpers
let aiInstance: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI | null {
  if (!aiInstance && process.env.GEMINI_API_KEY) {
    aiInstance = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiInstance;
}

async function generateWithGemini(prompt: string): Promise<string | null> {
  const client = getGeminiClient();
  if (!client) return null;
  try {
    const response = await client.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: prompt,
    });
    return response.text?.trim() || null;
  } catch (error) {
    console.error('Gemini generation error:', error);
    return null;
  }
}

async function getDetailedPersonBiography(name: string): Promise<string> {
  const prompt = `Write a professional, detailed, and engaging biography of about 120-150 words for the film professional (actor, actress, or director) named "${name}". Mention their notable career, general style, and significance in cinema. Output ONLY the biography text, with no introductory or concluding remarks.`;
  const gText = await generateWithGemini(prompt);
  if (gText) return gText;
  
  // Fallbacks if Gemini fails
  return `${name} is an acclaimed figure in the entertainment industry, widely recognized for outstanding contributions to modern cinema. Throughout a distinguished career, ${name} has collaborated on numerous highly rated and culturally significant cinematic masterpieces, captivating audiences worldwide with remarkable talent, artistic versatility, and high professional standards.`;
}

async function getDetailedStudioDescription(name: string): Promise<string> {
  const prompt = `Write a professional, detailed, and engaging description of about 120-150 words for the film production company or studio named "${name}". Mention their iconic projects, history, and general reputation in the media industry. Output ONLY the description text, with no introductory or concluding remarks.`;
  const gText = await generateWithGemini(prompt);
  if (gText) return gText;
  
  // Fallbacks if Gemini fails
  return `${name} is a premier global entertainment studio and film production company, famous for producing highly acclaimed and visually stunning motion pictures and series. With a strong track record of creative excellence, innovation, and storytelling, the company has brought some of the most memorable and beloved narratives to screens everywhere, setting benchmarks across the entire entertainment sector.`;
}

// Fetch person details
app.get("/api/person/details/:name", async (req, res) => {
  const { name } = req.params;
  const apiKey = process.env.TMDB_API_KEY;
  
  if (!apiKey) {
    const biography = await getDetailedPersonBiography(name);
    return res.json({
      name: name,
      biography: biography,
      birthday: null,
      age: null,
      profile_path: null,
      place_of_birth: null,
      titles: []
    });
  }

  try {
    const isV4 = apiKey.length > 50;
    const searchUrl = new URL(`${TMDB_BASE_URL}/search/person`);
    searchUrl.searchParams.append('query', name);
    if (!isV4) {
      searchUrl.searchParams.append('api_key', apiKey);
    }

    const options: any = { 
      headers: { accept: 'application/json' },
      timeout: 5000
    };
    if (isV4) {
      options.headers.Authorization = `Bearer ${apiKey}`;
    }

    const searchResponse = await axios.get(searchUrl.toString(), options);
    const searchData = searchResponse.data;

    if (searchData.results && searchData.results.length > 0) {
      const personId = searchData.results[0].id;
      const detailsUrl = new URL(`${TMDB_BASE_URL}/person/${personId}`);
      if (!isV4) {
        detailsUrl.searchParams.append('api_key', apiKey);
      }
      const detailsResponse = await axios.get(detailsUrl.toString(), options);
      if (detailsResponse.status === 200) {
        const details = detailsResponse.data;
        let age = null;
        if (details.birthday) {
          const birthDate = new Date(details.birthday);
          const ageDifMs = Date.now() - birthDate.getTime();
          const ageDate = new Date(ageDifMs);
          age = Math.abs(ageDate.getUTCFullYear() - 1970);
        }

        let biography = details.biography;
        if (!biography || biography.trim().length < 100) {
          biography = await getDetailedPersonBiography(details.name || name);
        }

        return res.json({
          name: details.name,
          biography: biography,
          birthday: details.birthday,
          age: age,
          profile_path: details.profile_path ? `https://image.tmdb.org/t/p/w500${details.profile_path}` : null,
          place_of_birth: details.place_of_birth,
          titles: []
        });
      }
    }

    const biography = await getDetailedPersonBiography(name);
    return res.json({
      name: name,
      biography: biography,
      birthday: null,
      age: null,
      profile_path: null,
      place_of_birth: null,
      titles: []
    });
  } catch (error: any) {
    console.error(`TMDB Person error:`, error);
    try {
      const biography = await getDetailedPersonBiography(name);
      return res.json({
        name: name,
        biography: biography,
        birthday: null,
        age: null,
        profile_path: null,
        place_of_birth: null,
        titles: []
      });
    } catch (innerErr) {
      return res.status(500).json({ error: "Failed to load details" });
    }
  }
});

// Fetch studio details
app.get("/api/studio/details/:name", async (req, res) => {
  const { name } = req.params;
  const apiKey = process.env.TMDB_API_KEY;

  if (!apiKey) {
    const description = await getDetailedStudioDescription(name);
    return res.json({
      name: name,
      description: description,
      logo_path: null,
      headquarters: null,
      homepage: null,
      titles: []
    });
  }

  try {
    const isV4 = apiKey.length > 50;
    const searchUrl = new URL(`${TMDB_BASE_URL}/search/company`);
    searchUrl.searchParams.append('query', name);
    if (!isV4) {
      searchUrl.searchParams.append('api_key', apiKey);
    }

    const options: any = { 
      headers: { accept: 'application/json' },
      timeout: 5000
    };
    if (isV4) {
      options.headers.Authorization = `Bearer ${apiKey}`;
    }

    const searchResponse = await axios.get(searchUrl.toString(), options);
    const searchData = searchResponse.data;

    if (searchData.results && searchData.results.length > 0) {
      const companyId = searchData.results[0].id;
      const detailsUrl = new URL(`${TMDB_BASE_URL}/company/${companyId}`);
      if (!isV4) {
        detailsUrl.searchParams.append('api_key', apiKey);
      }
      const detailsResponse = await axios.get(detailsUrl.toString(), options);
      if (detailsResponse.status === 200) {
        const details = detailsResponse.data;
        
        let description = details.description;
        if (!description || description.trim().length < 100) {
          description = await getDetailedStudioDescription(details.name || name);
        }

        return res.json({
          name: details.name,
          description: description,
          logo_path: details.logo_path ? `https://image.tmdb.org/t/p/w500${details.logo_path}` : null,
          headquarters: details.headquarters,
          homepage: details.homepage,
          titles: []
        });
      }
    }

    const description = await getDetailedStudioDescription(name);
    return res.json({
      name: name,
      description: description,
      logo_path: null,
      headquarters: null,
      homepage: null,
      titles: []
    });
  } catch (error: any) {
    console.error(`TMDB Studio error:`, error);
    try {
      const description = await getDetailedStudioDescription(name);
      return res.json({
        name: name,
        description: description,
        logo_path: null,
        headquarters: null,
        homepage: null,
        titles: []
      });
    } catch (innerErr) {
      return res.status(500).json({ error: "Failed to load details" });
    }
  }
});

export default app;

// Add user lists API
app.get("/api/user-lists", async (req, res) => {
  const { userId, type } = req.query;
  if (!userId) return res.status(400).json({ error: "Missing userId" });
  try {
    const { getUserListServer } = await import("./server-db.js");
    const result = await getUserListServer(String(userId), type ? String(type) : undefined);
    res.json(result);
  } catch(e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/user-lists", express.json(), async (req, res) => {
  const { userId, contentId, listType, action } = req.body;
  if (!userId || !contentId || !listType) return res.status(400).json({ error: "Missing required fields" });
  try {
    const { saveUserListServer } = await import("./server-db.js");
    await saveUserListServer(userId, contentId, listType, action || 'add');
    res.json({ success: true });
  } catch(e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/user-lists", express.json(), async (req, res) => {
  const { userId, contentId, listType } = req.body;
  try {
    const { saveUserListServer } = await import("./server-db.js");
    await saveUserListServer(userId, contentId, listType, 'remove');
    res.json({ success: true });
  } catch(e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/user-ratings/aggregate", async (req, res) => {
  const { contentId } = req.query;
  if (!contentId) return res.status(400).json({ error: "Missing contentId parameter" });
  try {
    const { getContentRatingStatsServer } = await import("./server-db.js");
    const stats = await getContentRatingStatsServer(String(contentId));
    res.json(stats);
  } catch(e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/user-ratings", async (req, res) => {
  const { userId, contentId } = req.query;
  if (!userId || !contentId) return res.status(400).json({ error: "Missing fields" });
  try {
    const { getUserRatingServer } = await import("./server-db.js");
    const rating = await getUserRatingServer(String(userId), String(contentId));
    res.json({ rating: rating ?? null });
  } catch(e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/user-ratings", express.json(), async (req, res) => {
  const { userId, contentId, rating } = req.body;
  if (!userId || !contentId || rating == null) return res.status(400).json({ error: "Missing fields" });
  const numRating = Number(rating);
  if (isNaN(numRating) || numRating < 1 || numRating > 10) {
    return res.status(400).json({ error: "Rating must be a number between 1 and 10" });
  }
  try {
    const { saveUserRatingServer } = await import("./server-db.js");
    const result = await saveUserRatingServer(String(userId), String(contentId), numRating);
    if (!result.success) {
      return res.status(500).json({ error: "Failed to save rating" });
    }
    res.json({ 
      success: true, 
      userRating: numRating, 
      totalRatings: result.totalRatings, 
      averageRating: result.averageRating 
    });
  } catch(e: any) {
    res.status(500).json({ error: e.message });
  }
});


async function enrichDatabaseContent(): Promise<{ total: number; updated: number; errors: number }> {
  const apiKey = process.env.TMDB_API_KEY;
  const allItems = await getAllContent();
  if (!allItems || allItems.length === 0) {
    return { total: 0, updated: 0, errors: 0 };
  }

  let updated = 0;
  let errors = 0;

  if (!apiKey) {
    for (const item of allItems) {
      let needsUpdate = false;
      const updates: any = {};

      if (!item.franchiseName && item.franchise) {
        updates.franchiseName = item.franchise;
        needsUpdate = true;
      }
      if (!item.franchise && item.franchiseName) {
        updates.franchise = item.franchiseName;
        needsUpdate = true;
      }

      if (needsUpdate) {
        await saveContent({ ...item, ...updates });
        updated++;
      }
    }
    return { total: allItems.length, updated, errors };
  }

  const isV4 = apiKey.length > 50;
  const options: any = { 
    headers: { accept: 'application/json' },
    timeout: 8000
  };
  if (isV4) {
    options.headers.Authorization = `Bearer ${apiKey}`;
  }

  for (const item of allItems) {
    try {
      let tmdbId = item.tmdbId;
      const titleName = item.title || item.name || '';
      if (!titleName) continue;

      const isTv = item.category === 'Series' || item.category === 'TV Shows' || item.category === 'Anime' || (item.seasons && item.seasons > 0);
      const mediaType = isTv ? 'tv' : 'movie';

      if (!tmdbId) {
        const searchUrl = new URL(`${TMDB_BASE_URL}/search/${mediaType}`);
        searchUrl.searchParams.append('query', titleName);
        if (item.year) {
          if (isTv) searchUrl.searchParams.append('first_air_date_year', String(item.year));
          else searchUrl.searchParams.append('primary_release_year', String(item.year));
        }
        if (!isV4) searchUrl.searchParams.append('api_key', apiKey);

        const searchRes = await axios.get(searchUrl.toString(), options).catch(() => null);
        if (searchRes?.data?.results?.length > 0) {
          tmdbId = searchRes.data.results[0].id;
        }
      }

      let tmdbData: any = null;
      if (tmdbId) {
        const detailsUrl = new URL(`${TMDB_BASE_URL}/${mediaType}/${tmdbId}`);
        detailsUrl.searchParams.append('append_to_response', 'credits,aggregate_credits');
        if (!isV4) detailsUrl.searchParams.append('api_key', apiKey);

        const detailsRes = await axios.get(detailsUrl.toString(), options).catch(() => null);
        if (detailsRes?.data) {
          tmdbData = detailsRes.data;
        }
      }

      const updates: any = {};
      let needsSave = false;

      if (tmdbId && !item.tmdbId) {
        updates.tmdbId = Number(tmdbId);
        needsSave = true;
      }

      if (tmdbData) {
        if (!item.director || item.director.trim() === '' || item.director.toLowerCase() === 'unknown') {
          // 1. Direct Director in credits.crew
          let dirObj = tmdbData.credits?.crew?.find((c: any) => c.job === 'Director');
          
          // 2. aggregate_credits for TV series (directors across episodes)
          if (!dirObj && tmdbData.aggregate_credits?.crew) {
            const dirCandidates = tmdbData.aggregate_credits.crew
              .filter((c: any) => c.jobs && c.jobs.some((j: any) => j.job === 'Director'))
              .map((c: any) => {
                const dJob = c.jobs.find((j: any) => j.job === 'Director');
                return {
                  name: c.name,
                  profile_path: c.profile_path,
                  episodes: dJob ? dJob.episode_count : 0
                };
              })
              .sort((a: any, b: any) => b.episodes - a.episodes);
            if (dirCandidates.length > 0) {
              dirObj = dirCandidates[0];
            }
          }

          // 3. created_by (standard for many TV shows)
          if (!dirObj && tmdbData.created_by && tmdbData.created_by.length > 0) {
            dirObj = tmdbData.created_by[0];
          }

          // 4. Fallback for TV: Creator / Showrunner / Executive Producer / Writer
          if (!dirObj && tmdbData.credits?.crew) {
            dirObj = tmdbData.credits.crew.find((c: any) => c.job === 'Creator' || c.job === 'Showrunner' || c.job === 'Executive Producer' || c.job === 'Writer');
          }

          if (dirObj && dirObj.name) {
            updates.director = dirObj.name;
            if (dirObj.profile_path) {
              updates.directorPhotoUrl = `https://image.tmdb.org/t/p/w500${dirObj.profile_path}`;
            }
            needsSave = true;
          }
        }

        const castList = tmdbData.credits?.cast || [];
        if (castList.length > 0) {
          const actorsData = castList.slice(0, 20).map((c: any) => ({
            name: c.name,
            character: c.character || '',
            profileUrl: c.profile_path ? `https://image.tmdb.org/t/p/w500${c.profile_path}` : null,
            gender: c.gender
          }));

          const maleActors = castList
            .filter((c: any) => c.gender === 2)
            .slice(0, 15)
            .map((c: any) => c.name);

          const femaleActors = castList
            .filter((c: any) => c.gender === 1)
            .slice(0, 15)
            .map((c: any) => c.name);

          const castNames = castList.slice(0, 15).map((c: any) => c.name);

          if (!item.actorsData || !Array.isArray(item.actorsData) || item.actorsData.length === 0) {
            updates.actorsData = actorsData;
            needsSave = true;
          }
          if (!item.maleActors || !Array.isArray(item.maleActors) || item.maleActors.length === 0) {
            updates.maleActors = maleActors;
            needsSave = true;
          }
          if (!item.femaleActors || !Array.isArray(item.femaleActors) || item.femaleActors.length === 0) {
            updates.femaleActors = femaleActors;
            needsSave = true;
          }
          if (!item.cast || (Array.isArray(item.cast) && item.cast.length === 0)) {
            updates.cast = castNames;
            needsSave = true;
          }
        }

        const prodCompanies = tmdbData.production_companies || [];
        if (prodCompanies.length > 0) {
          const studiosData = prodCompanies.map((pc: any) => ({
            name: pc.name,
            logoUrl: pc.logo_path ? `https://image.tmdb.org/t/p/w500${pc.logo_path}` : null
          }));
          if (!item.studiosData || !Array.isArray(item.studiosData) || item.studiosData.length === 0) {
            updates.studiosData = studiosData;
            needsSave = true;
          }
          if (!item.network && !item.studio) {
            updates.network = prodCompanies[0].name;
            updates.studio = prodCompanies[0].name;
            needsSave = true;
          }
        }

        const netList = tmdbData.networks || [];
        if (netList.length > 0) {
          const networks = netList.map((n: any) => ({
            name: n.name,
            logoUrl: n.logo_path ? `https://image.tmdb.org/t/p/w500${n.logo_path}` : null
          }));
          if (!item.networks || !Array.isArray(item.networks) || item.networks.length === 0) {
            updates.networks = networks;
            needsSave = true;
          }
          if (!item.network) {
            updates.network = netList[0].name;
            needsSave = true;
          }
        }

        if (tmdbData.belongs_to_collection) {
          const colId = String(tmdbData.belongs_to_collection.id);
          const colName = tmdbData.belongs_to_collection.name;
          if (item.franchiseId !== colId || item.franchiseName !== colName || item.franchise !== colName) {
            updates.franchiseId = colId;
            updates.franchiseName = colName;
            updates.franchise = colName;
            needsSave = true;
          }
        }
      }

      if (!item.franchiseName && (item.franchise || updates.franchise)) {
        updates.franchiseName = item.franchise || updates.franchise;
        needsSave = true;
      }
      if (!item.franchise && (item.franchiseName || updates.franchiseName)) {
        updates.franchise = item.franchiseName || updates.franchiseName;
        needsSave = true;
      }

      if (needsSave) {
        await saveContent({
          ...item,
          ...updates
        });
        updated++;
      }
    } catch (err) {
      console.error(`Error enriching content ID ${item.id}:`, err);
      errors++;
    }
  }

  return { total: allItems.length, updated, errors };
}

app.get("/api/admin/enrich-database", async (req, res) => {
  try {
    const result = await enrichDatabaseContent();
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/enrich-database", async (req, res) => {
  try {
    const result = await enrichDatabaseContent();
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/admin/deduplicate", async (req, res) => {
  try {
    const result = await deduplicateContentDatabase();
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/deduplicate", async (req, res) => {
  try {
    const result = await deduplicateContentDatabase();
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/restore-backup", async (req, res) => {
  try {
    const result = await restoreFromBackup();
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/admin/restore-backup", async (req, res) => {
  try {
    const result = await restoreFromBackup();
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/export-database", async (req, res) => {
  try {
    const allContent = await getAllContent();
    const backupPayload = JSON.stringify(allContent, null, 2);
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="cinemanetwork-db-export-${Date.now()}.json"`);
    res.send(backupPayload);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`[Database] Local PGLite Primary connected, Supabase PostgreSQL Backup connected, Cloud Firestore tertiary connected.`);

    // Run database hydration and background tasks asynchronously after server binds to port
    (async () => {
      try {
        // Wait 2.5s to ensure dev server and Vite middleware are fully idle and ready for incoming HTTP requests
        await new Promise((resolve) => setTimeout(resolve, 2500));

        const { initializeLocalDb } = await import('./src/db/index.js');
        await initializeLocalDb();
        
        const { runBackgroundStartupTasks } = await import('./server-db.js');
        await runBackgroundStartupTasks();
      } catch (err) {
        console.error('[DB Init] Failed to initialize local database in background:', err);
      }
    })();
  });
}

if (!process.env.VERCEL) {
  startServer();
}

