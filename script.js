document.addEventListener('DOMContentLoaded', () => {

    console.log("script.js loaded and starting...");

    // Initialize the map and set a default view (this runs first)
    const map = L.map('map').setView([0, 0], 2);
    console.log("Map initialized (initial view)...");

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
    console.log("Tile layer added...");

    let userMarker;
    let currentLat;
    let currentLon;
    let routingControl;
    let poiMarkers = L.layerGroup().addTo(map); // A new layer group for our POI markers

    // Get references to our HTML elements
    const destinationInput = document.getElementById('destinationInput');
    const searchQueryInput = document.getElementById('searchQueryInput');
    const searchButton = document.getElementById('searchButton');
    const resultsList = document.getElementById('resultsList');

    // Function to get the user's current location
    function getUserLocation() {
        console.log("Attempting to get user location...");
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    console.log("Geolocation SUCCESS!");
                    currentLat = position.coords.latitude;
                    currentLon = position.coords.longitude;
                    const accuracy = position.coords.accuracy;

                    console.log(`Current location: Lat ${currentLat}, Lon ${currentLon}, Accuracy: ${accuracy} meters`);

                    map.setView([currentLat, currentLon], 13);

                    if (userMarker) {
                        userMarker.setLatLng([currentLat, currentLon]);
                    } else {
                        userMarker = L.marker([currentLat, currentLon]).addTo(map)
                            .bindPopup('You are here (approx. ' + Math.round(accuracy) + 'm accuracy)').openPopup();
                    }
                },
                (error) => {
                    console.error("Error getting location: ", error);
                    alert("Could not retrieve your location. Please ensure location services are enabled and granted permission.");
                    currentLat = 34.0522;
                    currentLon = -118.2437;
                    map.setView([currentLat, currentLon], 10);
                    if (userMarker) {
                        userMarker.setLatLng([currentLat, currentLon]);
                    } else {
                        userMarker = L.marker([currentLat, currentLon]).addTo(map)
                            .bindPopup('Default Location (LA) - failed to get your exact location').openPopup();
                    }
                },
                {
                    enableHighAccuracy: true,
                    timeout: 20000,
                    maximumAge: 0
                }
            );
        } else {
            console.log("Geolocation NOT supported by browser.");
            alert("Geolocation is not supported by your browser.");
            currentLat = 34.0522;
            currentLon = -118.2437;
            map.setView([currentLat, currentLon], 10);
            if (userMarker) {
                userMarker.setLatLng([currentLat, currentLon]);
            } else {
                userMarker = L.marker([currentLat, currentLon]).addTo(map)
                    .bindPopup('Default Location (LA) - Geolocation not supported').openPopup();
            }
        }
    }

    // Function to draw the route
    function drawRoute(startLat, startLon, endAddress, searchQuery) {
        console.log(`Attempting to draw route from (${startLat}, ${startLon}) to ${endAddress}`);

        if (!startLat || !startLon) {
            alert("Your current location is not available. Please allow location access.");
            return;
        }

        if (routingControl) {
            map.removeControl(routingControl);
        }

        console.log("Starting geocoding for destination:", endAddress);

        // Geocoding URL for Nominatim (converts address to coordinates)
        const geocodeUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(endAddress)}&format=json&limit=1`;

        fetch(geocodeUrl)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.json();
            })
            .then(results => {
                if (results && results.length > 0) {
                    console.log("Geocoding successful. Results found:", results.length);
                    const destination = results[0];
                    const destinationLat = parseFloat(destination.lat);
                    const destinationLon = parseFloat(destination.lon);

                    console.log(`Destination found: ${destination.display_name} Lat: ${destinationLat}, Lon: ${destinationLon}`);

                    routingControl = L.Routing.control({
                        waypoints: [
                            L.latLng(startLat, startLon),
                            L.latLng(destinationLat, destinationLon)
                        ],
                        routeWhileDragging: false,
                        lineOptions: {
                            styles: [{ color: 'blue', opacity: 0.7, weight: 7 }]
                        },
                        showAlternatives: false,
                        addWaypoints: false,
                        draggableWaypoints: false,
                        fitSelectedRoutes: true
                    }).addTo(map);

                    L.marker([destinationLat, destinationLon]).addTo(map)
                        .bindPopup(`Destination: ${destination.display_name}`).openPopup();

                    if (searchQuery) {
                        routingControl.on('routesfound', (e) => {
                            console.log("Route found event fired. Calculating bounds for POI search...");
                            if (e.routes && e.routes.length > 0) {
                                const routeCoordinates = e.routes[0].coordinates;
                                const bounds = L.latLngBounds(routeCoordinates);
                                const bbox = `${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}`;
                                searchForPointsOfInterest(searchQuery, bbox);
                            } else {
                                console.error("No route coordinates available for POI search.");
                                alert("Sorry, we could not find a route to that destination.");
                            }
                        });

                        routingControl.on('routingerror', (e) => {
                            console.error("Routing error:", e.error.message);
                            alert(`Routing error: ${e.error.message}`);
                        });
                    }

                } else {
                    console.error("Geocoding failed for destination:", endAddress);
                    alert("Destination not found. Please try a more specific address or place name.");
                }
            })
            .catch(error => {
                console.error("Error during geocoding fetch:", error);
                alert("An error occurred while geocoding the destination.");
            });
    }

    // --- FUNCTION TO SEARCH ALONG THE ROUTE ---
    function searchForPointsOfInterest(searchQuery, bbox) {
        console.log(`Searching for '${searchQuery}' with Google Places API...`);

        // Clear previous POI markers
        poiMarkers.clearLayers();
        resultsList.innerHTML = '';

        // Google Places API call
        const googlePlacesApiUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(searchQuery)}&location=${currentLat},${currentLon}&radius=10000&key=AIzaSyCG_X7QjB3kuigVLBJNZlkRdDMomlL7dQg`;

        fetch(googlePlacesApiUrl)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Google Places API error! status: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                console.log("Google Places API raw data:", data);

                if (data.results && data.results.length > 0) {
                    console.log(`Found ${data.results.length} points of interest with Google Places.`);
                    data.results.forEach((place) => {
                        const lat = place.geometry.location.lat;
                        const lon = place.geometry.location.lng;
                        const name = place.name || 'Unnamed';
                        const address = place.formatted_address || 'Address not available';

                        const marker = L.marker([lat, lon]).addTo(poiMarkers)
                            .bindPopup(`<b>${name}</b><br>${address}`);

                        const listItem = document.createElement('li');
                        listItem.textContent = name;
                        resultsList.appendChild(listItem);
                    });
                } else {
                    console.log("No points of interest found for this query.");
                    resultsList.innerHTML = '<li>No results found.</li>';
                }
            })
            .catch(error => {
                console.error("Error during Google Places API fetch:", error);
                alert("An error occurred while searching for points of interest.");
            });
    }

    // Event Listener for the Search Button
    searchButton.addEventListener('click', () => {
        console.log("Search button clicked!");
        const destination = destinationInput.value.trim();
        const searchQuery = searchQueryInput.value.trim();

        if (!destination) {
            alert("Please enter a destination!");
            return;
        }

        drawRoute(currentLat, currentLon, destination, searchQuery);
    });

    console.log("Calling getUserLocation()...");
    getUserLocation();
    console.log("End of script.js.");
});
