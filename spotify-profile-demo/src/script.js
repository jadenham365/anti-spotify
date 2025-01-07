const clientId = "63f65f0d6c114fad99025ac5d2b2cee9";
const params = new URLSearchParams(window.location.search);
const code = params.get("code");

if (!code) {
    redirectToAuthCodeFlow(clientId);
} else {
    const accessToken = await getAccessToken(clientId, code);
    const profile = await fetchProfile(accessToken);

    const topArtists = await getUserTopItems(accessToken, 'artists', 'medium_term', 10);
    let topGenres = new Set();
    topArtists.forEach(artist => {
        artist.genres.forEach(genre => topGenres.add(genre));
    });
    topGenres = Array.from(topGenres);

    console.log('Top Artists:', topArtists);
    console.log('Top Genres:', topGenres);

    let antiGenres = new Set();
    for (let i = 0; i < topGenres.length; i++) {
        const result = await fetchAntiGenres(topGenres[i]);
        try {
            result.forEach(genre => antiGenres.add(genre));
        } catch (error) {
            console.error(error.message);
        }
    }
    antiGenres = Array.from(antiGenres);

    const shuffled = antiGenres;
    for (let i = shuffled.length - 1; i > 0; i--) {
        const randomIndex = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[i]]; // Swap
    }
    antiGenres = shuffled.slice(0, 50);

    console.log('Anti-Genres:', antiGenres);

    const trackResults = await fetchTracks(accessToken, antiGenres);
    console.log('Track Results:', trackResults);

    populateUI(profile, topArtists, topGenres, antiGenres);
    createAndDisplayPlaylist(accessToken, trackResults);
}


export async function redirectToAuthCodeFlow(clientId) {
    const verifier = generateCodeVerifier(128);
    const challenge = await generateCodeChallenge(verifier);

    localStorage.setItem("verifier", verifier);

    const params = new URLSearchParams();
    params.append("client_id", clientId);
    params.append("response_type", "code");
    params.append("redirect_uri", "http://localhost:5173/callback");
    params.append("scope", "user-read-private user-read-email user-top-read playlist-modify-public playlist-modify-private");
    params.append("code_challenge_method", "S256");
    params.append("code_challenge", challenge);
    

    document.location = `https://accounts.spotify.com/authorize?${params.toString()}`;
}

function generateCodeVerifier(length) {
    let text = '';
    let possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

    for (let i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

async function generateCodeChallenge(codeVerifier) {
    const data = new TextEncoder().encode(codeVerifier);
    const digest = await window.crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode.apply(null, [...new Uint8Array(digest)]))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}


export async function getAccessToken(clientId, code) {
    const verifier = localStorage.getItem("verifier");

    const params = new URLSearchParams();
    params.append("client_id", clientId);
    params.append("grant_type", "authorization_code");
    params.append("code", code);
    params.append("redirect_uri", "http://localhost:5173/callback");
    params.append("code_verifier", verifier);

    const result = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params
    });

    const { access_token } = await result.json();
    return access_token;
}

async function fetchProfile(token) {
    const result = await fetch("https://api.spotify.com/v1/me", {
        method: "GET", headers: { Authorization: `Bearer ${token}` }
    });

    return await result.json();
}


async function getUserTopItems(accessToken, type = 'artists', timeRange = 'medium_term', limit = 20) {
    const url = `https://api.spotify.com/v1/me/top/${type}?time_range=${timeRange}&limit=${limit}`;

    const response = await fetch(url, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
        },
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch user's top ${type}: ${response.statusText}`);
    }

    const data = await response.json();
    return data.items;
}

async function fetchAntiGenres(genre) {
    try {
        const response = await fetch(`http://localhost:3000/mirror-genres?genre=${encodeURIComponent(genre)}`);
        const data = await response.json();
        console.log(`Anti-genres for ${genre}:`, data.antiGenres);
        return data.antiGenres;
    } catch (error) {
        console.error('Error fetching anti-genres:', error);
        return [];
    }
}

async function fetchTracks(accessToken, genreList) {
    const baseUrl = 'https://api.spotify.com/v1/search';
    const results = [];

    // Process each genre separately
    for (const genre of genreList) {
        const offset = Math.floor(Math.random() * 100);
        const query = `q=genre:${encodeURIComponent(genre)}&type=track&market=US&limit=1&offset=${encodeURIComponent(offset)}`;
        const url = `${baseUrl}?${query}`;

        try {
            const response = await fetch(url, {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            });

            if (!response.ok) {
                console.error(`Failed to fetch tracks for genre: ${genre} - ${response.statusText}`);
                continue;
            }
            console.log(`processing ${genre}`);
            const data = await response.json();
            results.push(...(data.tracks?.items || [])); // Aggregate results
        } catch (error) {
            console.error(`Error fetching tracks for genre: ${genre} - ${error.message}`);
        }
    }

    return results; // Return aggregated results
}

// Helper function to create a new playlist
async function createPlaylist(userId, token) {
    const playlistName = "Diversify";
    const description = "A playlist of anti-recommendations based on your top artists";
    const endpoint = `https://api.spotify.com/v1/users/${userId}/playlists`;

    const response = await fetch(endpoint, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            name: playlistName,
            description: description,
            public: false // Make the playlist public
        })
    });

    const data = await response.json();
    if (response.ok) {
        console.log("Playlist created:", data);
        return data; // Returns the new playlist object
    } else {
        console.error("Error creating playlist:", data);
        throw new Error(data.error.message);
    }
}

// Helper function to add tracks to a playlist
async function addTracksToPlaylist(playlistId, trackUris, token) {
    const endpoint = `https://api.spotify.com/v1/playlists/${playlistId}/tracks`;

    const response = await fetch(endpoint, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            uris: trackUris // Array of track URIs
        })
    });

    const data = await response.json();
    if (response.ok) {
        console.log("Tracks added to playlist:", data);
    } else {
        console.error("Error adding tracks:", data);
        throw new Error(data.error.message);
    }
}

// Main function to create a playlist, add tracks, and display it
async function createAndDisplayPlaylist(token, tracks) {
    try {
        // Assuming 'userId' is obtained elsewhere in your script
        const userId = document.getElementById("id").textContent;

        // Create a new playlist
        const newPlaylist = await createPlaylist(userId, token);

        // Add the first 50 tracks (or fewer if less than 50 available)
        const trackUris = tracks.map(track => track.uri);
        await addTracksToPlaylist(newPlaylist.id, trackUris, token);

        // Display the playlist on the page
        const profileSection = document.getElementById("profile");
        const playlistLink = document.createElement("a");
        playlistLink.href = newPlaylist.external_urls.spotify;
        playlistLink.textContent = newPlaylist.name;
        playlistLink.target = "_blank";

        const playlistItem = document.createElement("li");
        playlistItem.textContent = "New Playlist: ";
        playlistItem.appendChild(playlistLink);

        profileSection.appendChild(playlistItem);
    } catch (error) {
        console.error("Error creating and displaying playlist:", error);
    }
}


function populateUI(profile, artists, genres, mirrors) {
    document.getElementById("displayName").innerText = profile.display_name;
    if (profile.images[0]) {
        const profileImage = new Image(200, 200);
        profileImage.src = profile.images[0].url;
        document.getElementById("avatar").appendChild(profileImage);
        document.getElementById("imgUrl").innerText = profile.images[0].url;
    }
    document.getElementById("id").innerText = profile.id;
    document.getElementById("email").innerText = profile.email;
    document.getElementById("uri").innerText = profile.uri;
    document.getElementById("uri").setAttribute("href", profile.external_urls.spotify);
    document.getElementById("url").innerText = profile.href;
    document.getElementById("url").setAttribute("href", profile.href);
    for (let i = 0; i < artists.length; i++) {
        document.getElementById("artists").append(artists[i].name);
        if (i < artists.length - 1) {
            document.getElementById("artists").append(", ");
        }
    }
    for (let i = 0; i < genres.length; i++) {
        document.getElementById("genres").append(genres[i]);
        if (i < genres.length - 1) {
            document.getElementById("genres").append(", ");
        }
    }
    for (let i = 0; i < mirrors.length; i++) {
        document.getElementById("mirrors").append(mirrors[i]);
        if (i < mirrors.length - 1) {
            document.getElementById("mirrors").append(", ");
        }
    }
}