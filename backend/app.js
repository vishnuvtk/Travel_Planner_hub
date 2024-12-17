require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

let accessToken = null;
let tokenExpiry = null;

// Function to fetch Amadeus Access Token
const fetchAccessToken = async () => {
    try {
        const response = await axios.post(
            'https://test.api.amadeus.com/v1/security/oauth2/token',
            new URLSearchParams({
                grant_type: 'client_credentials',
                client_id: process.env.AMADEUS_API_KEY,
                client_secret: process.env.AMADEUS_API_SECRET,
            }),
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );
        accessToken = response.data.access_token;
        tokenExpiry = Date.now() + response.data.expires_in * 1000;
        console.log('New Amadeus Access Token fetched');
    } catch (error) {
        console.error('Error fetching access token:', error.message);
        throw new Error('Failed to fetch Amadeus access token');
    }
};

// Middleware for Access Token
const ensureAccessToken = async (req, res, next) => {
    if (!accessToken || Date.now() >= tokenExpiry) {
        await fetchAccessToken();
    }
    next();
};

// Route for Flight Search
app.post('/api/flights', ensureAccessToken, async (req, res) => {
    const { origin, destination, date } = req.body;
    try {
        const response = await axios.get('https://test.api.amadeus.com/v2/shopping/flight-offers', {
            params: {
                originLocationCode: origin,
                destinationLocationCode: destination,
                departureDate: date,
                adults: 1,
            },
            headers: { Authorization: `Bearer ${accessToken}` },
        });

        const flights = response.data.data.map((flight) => {
            const itinerary = flight.itineraries[0];
            return {
                flightNumber: itinerary.segments[0].carrierCode + itinerary.segments[0].number,
                airline: flight.validatingAirlineCodes[0],
                price: flight.price.total,
                departureDate: itinerary.segments[0].departure.at,
                arrivalDate: itinerary.segments[itinerary.segments.length - 1].arrival.at,
            };
        });
        res.json(flights);
    } catch (error) {
        console.error('Error fetching flight data:', error.message);
        res.status(500).json({ error: 'Failed to fetch flight data' });
    }
});

// Route for fetching Location Details using Amadeus API
app.post('/api/location', ensureAccessToken, async (req, res) => {
    const { iata } = req.body;

    try {
        const response = await axios.get('https://test.api.amadeus.com/v1/reference-data/locations', {
            params: {
                keyword: iata,
                subType: 'AIRPORT,CITY',
            },
            headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (response.data.data && response.data.data.length > 0) {
            const location = response.data.data[0];
            const countryName = location.address?.countryName || 'Unknown';
            res.json({ country: countryName });
        } else {
            res.status(404).json({ error: 'Location not found' });
        }
    } catch (error) {
        console.error('Error fetching location details:', error.message);
        res.status(500).json({ error: 'Failed to fetch location details' });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
