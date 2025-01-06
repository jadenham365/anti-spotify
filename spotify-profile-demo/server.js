import express from 'express';
import axios from 'axios';
import { load } from 'cheerio';
import cors from 'cors'; // Import CORS

const app = express();
const PORT = 3000;

// Enable CORS
app.use(cors());

// Function to sanitize genre strings
function sanitizeGenre(genre) {
    return genre
        .toLowerCase() // Convert to lowercase
        .replace(/[^a-z0-9]/g, ''); // Remove non-alphanumeric characters
}

app.get('/mirror-genres', async (req, res) => {
    const { genre } = req.query;

    if (!genre) {
        res.status(400).json({ error: 'Genre parameter is required.' });
        return;
    }

    const sanitizedGenre = sanitizeGenre(genre);
    const url = `https://www.everynoise.com/engenremap-${sanitizedGenre}.html`;

    try {
        const response = await axios.get(url);
        const $ = load(response.data);

         // Check if the genre page exists by looking for a specific element on the page
        const pageTitle = $('title').text().toLowerCase();
        if (pageTitle.includes('not found') || pageTitle.includes('404')) {
        // Log the error but continue the execution
            console.error(`Genre '${genre}' not found on Everynoise.`);
            return res.status(404).json({ error: `Genre '${genre}' not found on Everynoise.` });
        }
        const antiGenres = [];
    
        $('[id^=mirroritem]').each((_, el) => {
            let antiGenre = $(el).text().trim(); // Extract and trim the text
            antiGenre = antiGenre.slice(0, -1); // Remove the last characters (">>")
            antiGenres.push(antiGenre);
        });
    
        res.json({ genre, sanitizedGenre, antiGenres });
    } catch (error) {
        console.error(`Error fetching URL: ${url}`);
        console.error(error.message);

        // Send a response back to the frontend without crashing the server
        res.status(500).json({ error: 'Failed to fetch anti-genres. Please try again later.' });
    }
    
});

app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
});
