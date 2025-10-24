// server.js
import express from 'express';
import multer from 'multer';
import cors from 'cors';
import fs from 'fs';
import axios from 'axios';
import crypto from 'crypto';
import { fileTypeFromBuffer } from 'file-type';
import { config } from './config.js';

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const { githubToken, owner, branch, repos } = config;

async function ensureRepoExists(repo) {
    try {
        await axios.get(`https://api.github.com/repos/${owner}/${repo}`, {
            headers: {
                Authorization: `Bearer ${githubToken}`,
                'User-Agent': 'Node.js'
            }
        });
    } catch (e) {
        if (e.response?.status === 404) {
            await axios.post(`https://api.github.com/user/repos`, {
                name: repo,
                private: false,
                auto_init: true
            }, {
                headers: {
                    Authorization: `Bearer ${githubToken}`,
                    'User-Agent': 'Node.js',
                    'Content-Type': 'application/json'
                }
            });
            console.log(`Repository ${repo} created successfully`);
        } else {
            throw e;
        }
    }
}

function generateRepoName() {
    return `dat-${crypto.randomBytes(3).toString('hex')}`;
}

async function uploadFile(buffer) {
    const detected = await fileTypeFromBuffer(buffer);
    const ext = detected?.ext || 'bin';
    const code = crypto.randomBytes(3).toString('hex');
    const fileName = `${code}-${Date.now()}.${ext}`;
    const filePathGitHub = `uploads/${fileName}`;
    const base64Content = Buffer.from(buffer).toString('base64');
    
    let targetRepo = repos[Math.floor(Math.random() * repos.length)];
    
    try {
        await ensureRepoExists(targetRepo);
    } catch {
        targetRepo = generateRepoName();
        await ensureRepoExists(targetRepo);
    }
    
    try {
        const response = await axios.put(
            `https://api.github.com/repos/${owner}/${targetRepo}/contents/${filePathGitHub}`,
            {
                message: `Upload file ${fileName}`,
                content: base64Content,
                branch: branch
            },
            {
                headers: {
                    Authorization: `Bearer ${githubToken}`,
                    'User-Agent': 'Node.js',
                    'Content-Type': 'application/json'
                }
            }
        );
        
        return `https://raw.githubusercontent.com/${owner}/${targetRepo}/${branch}/${filePathGitHub}`;
    } catch (error) {
        console.error('Upload error:', error.response?.data || error.message);
        throw new Error(`Failed to upload file: ${error.response?.data?.message || error.message}`);
    }
}

// Routes
app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        console.log(`Uploading file: ${req.file.originalname}, Size: ${req.file.size} bytes`);
        
        const url = await uploadFile(req.file.buffer);
        
        res.json({
            success: true,
            url: url,
            filename: req.file.originalname,
            size: req.file.size
        });
    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        service: 'GitHub File Upload',
        timestamp: new Date().toISOString()
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Visit: http://localhost:${PORT}`);
});
