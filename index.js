require("dotenv").config();

const express = require("express");
const passport = require("passport");
const SpotifyStrategy = require("passport-spotify").Strategy;
const axios = require("axios");
const cors = require("cors");
const app = express();
const puppeteer = require("puppeteer");

let songsFromSpotifyPlaylist = [];

// Create an OAuth2 client using the credentials

app.use(cors({ origin: "http://localhost:3000" }));

let clientID = process.env.CLIENTID;
let clientSecret = process.env.CLIENT_SECRET;

// let clientID = "2c0cb9d9e47542bf890b26f8c46555cf";
// let clientSecret = "886aec1fba28467d8803dfc913a93e93";

console.log(process.env.CLIENT_SECRET);
console.log(clientSecret, "clientSecret");

passport.use(
  new SpotifyStrategy(
    {
      clientID,
      clientSecret,
    },
    (accessToken, refreshToken, expires_in, profile, done) => {
      // Here, you can save the accessToken to use for further API requests
      console.log("Access Token:", accessToken);
      done(null, accessToken);
    }
  )
);

// Route to retrieve playlist songs
app.get("/playlist", async (req, res) => {
  try {
    const playlistUrl = req.query.playlistUrl;
    const playlistId = getPlaylistIdFromUrl(playlistUrl);

    if (!playlistId) {
      return res.status(400).send("Invalid playlist URL");
    }

    const accessToken = await getAccessToken();

    const tracks = await getPlaylistTracks(accessToken, playlistId);
    songsFromSpotifyPlaylist = extractSongInfo(tracks);

    console.log(songsFromSpotifyPlaylist.length);
    res.status(200).json({
      numberOfSongs: songsFromSpotifyPlaylist.length,
      playlist: songsFromSpotifyPlaylist,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Error retrieving playlist information");
  }
});

app.get("/youtube-playlist", async (req, res) => {
  try {
    const playlistList = req.query.playlistList;

    if (!playlistList) {
      return res.status(400).send("Invalid playlist");
    }

    searchSongsOnYouTube(playlistList.slice(0, 2))
      .then((youtubeLinks) => {
        console.log(youtubeLinks);
        res.status(200).json({ youtubeLinks });
      })
      .catch((error) => {
        console.error(error);
      });
  } catch (error) {
    console.error(error);
    res.status(500).send("Error Creating playlist");
  }
});

// Retrieves the tracks of a playlist using the Spotify API
async function getPlaylistTracks(accessToken, playlistId) {
  const apiUrl = `https://api.spotify.com/v1/playlists/${playlistId}/tracks`;

  const response = await axios.get(apiUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  return response.data.items;
}

// Extracts the playlist ID from the Spotify playlist URL
function getPlaylistIdFromUrl(url) {
  const regex = /playlist\/([\w\d]+)/;
  const matches = url.match(regex);
  return matches ? matches[1] : null;
}

// Retrieves an access token using the client_credentials flow
async function getAccessToken() {
  console.log(`${clientID}:${clientSecret} client id`);
  const response = await axios.post(
    "https://accounts.spotify.com/api/token",
    null,
    {
      params: {
        grant_type: "client_credentials",
      },
      headers: {
        Authorization: `Basic ${Buffer.from(
          `${clientID}:${clientSecret}`
        ).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );

  return response.data.access_token;
}

// Extracts the song name and artist from the playlist tracks
function extractSongInfo(tracks) {
  return tracks.map((track) => ({
    name: track.track.name,
    artist: track.track.artists.map((artist) => artist.name).join(", "),
  }));
}

function extractVideoId(link) {
  const regex = /[?&]v=([^?&]+)/;
  const match = link.match(regex);
  return match ? match[1] : null;
}
async function searchSongsOnYouTube(songs) {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();

  const youtubeIds = [];

  page.setDefaultNavigationTimeout(0); // Disable the navigation timeout

  for (const song of songs) {
    const searchQuery = `${song.name} ${song.artist} official music video`;

    await page.goto(
      `https://www.youtube.com/results?search_query=${encodeURIComponent(
        searchQuery
      )}`
    );

    try {
      await page.waitForSelector("#contents ytd-video-renderer a#thumbnail", {
        visible: true,
      });

      const videoLink = await page.evaluate(() => {
        const videoElement = document.querySelector(
          "#contents ytd-video-renderer a#thumbnail"
        );
        return videoElement ? videoElement.href : null;
      });

      if (videoLink) {
        const videoId = extractVideoId(videoLink);
        if (videoId) {
          youtubeIds.push(videoId);
        }
      }
    } catch (error) {
      console.error(`Error searching song: ${song.name} - ${song.artist}`);
      console.error(error);
    }
  }

  await browser.close();

  var youtubeIdsJoined = youtubeIds.join(",");
  var playlistLink = `https://www.youtube.com/watch_videos?video_ids=${youtubeIdsJoined}`;
  return playlistLink;
}

app.listen(process.env.PORT, () => {
  console.log("Server is running on port 4000");
});
