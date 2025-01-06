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
    console.log('Anti-Genres:', antiGenres);

    populateUI(profile, topArtists, topGenres, antiGenres);
}


export async function redirectToAuthCodeFlow(clientId) {
    const verifier = generateCodeVerifier(128);
    const challenge = await generateCodeChallenge(verifier);

    localStorage.setItem("verifier", verifier);

    const params = new URLSearchParams();
    params.append("client_id", clientId);
    params.append("response_type", "code");
    params.append("redirect_uri", "http://localhost:5173/callback");
    params.append("scope", "user-read-private user-read-email user-top-read");
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