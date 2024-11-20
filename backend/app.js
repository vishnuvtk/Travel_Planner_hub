require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

let accessToken = null;

// Function to fetch a new access token
const fetchAccessToken = async () => {
    try {
        const response = await axios.post(
            'https://test.api.amadeus.com/v1/security/oauth2/token',
            new URLSearchParams({
                grant_type: 'client_credentials',
                client_id: process.env.AMADEUS_API_KEY,
                client_secret: process.env.AMADEUS_API_SECRET,
            }),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
            }
        );
        accessToken = response.data.access_token;
        console.log('New access token:', accessToken);
    } catch (error) {
        console.error('Error fetching access token:', error.response?.data || error.message);
        throw new Error('Failed to fetch access token');
    }
};

// Middleware to ensure valid access token
const ensureAccessToken = async (req, res, next) => {
    if (!accessToken) {
        try {
            await fetchAccessToken();
        } catch (error) {
            return res.status(500).json({ error: 'Unable to fetch access token' });
        }
    }
    next();
};

// Route to handle flight search
app.post('/api/flights', ensureAccessToken, async (req, res) => {
    const { origin, destination, date } = req.body;

    try {
        const response = await axios.get(
            'https://test.api.amadeus.com/v2/shopping/flight-offers',
            {
                params: {
                    originLocationCode: origin,
                    destinationLocationCode: destination,
                    departureDate: date,
                    adults: 1,
                },
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            }
        );

        const flights = response.data.data.map((flight) => {
            const itinerary = flight.itineraries[0];
            const price = flight.price.total;
            const departure = itinerary.segments[0].departure;
            const arrival = itinerary.segments[itinerary.segments.length - 1].arrival;

            return {
                flightNumber: itinerary.segments[0].carrierCode + itinerary.segments[0].number,
                airline: flight.validatingAirlineCodes[0],
                price,
                departureDate: departure.at,
                arrivalDate: arrival.at,
            };
        });

        res.json(flights);
    } catch (error) {
        console.error('Error fetching flight data:', error.response?.data || error.message);
        res.status(500).json({ error: 'Error fetching flight data' });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
