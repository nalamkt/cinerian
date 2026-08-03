let imgPath = "https://image.tmdb.org/t/p/original";
let mainURL = "https://api.themoviedb.org/3/movie/";
let APIkey = "?api_key=f359e4f5496836068edda48527fe8c58";
let movieId;



function reload() {
    let baseMovURL = `https://api.themoviedb.org/3/discover/movie?api_key=f359e4f5496836068edda48527fe8c58&include_adult=false&language=es-MX&region=AR&sort_by=vote_count.desc&with_watch_providers=Netflix%7CDisney%20Plus`;
    const baseMov = new XMLHttpRequest();
    baseMov.open("GET", baseMovURL, true);
    baseMov.onload = function () {
        var response = JSON.parse(this.responseText);
        var array = response.results;
        var rand = Math.random() * (array.length - 0) + 0;
        rand = parseInt(rand);
        array = response.results[rand];

        movieId = array.id;

      try {
    // Encuentra el contenedor y borra su contenido anterior
    var container = document.getElementById("jw-widget-container");
    container.innerHTML = ''; // Limpia el contenido anterior

    var newDivs = document.createElement("div");
   newDivs.setAttribute("data-jw-widget", "");
   newDivs.setAttribute("data-api-key", "SMd1XU9yGrR2VMGK2VBBySeB6lEV8AOU");
   newDivs.setAttribute("data-object-type", "movie");
   newDivs.setAttribute("data-id-type", "tmdb");
   newDivs.setAttribute("data-theme", "dark");
   newDivs.setAttribute("data-language", "es");
   newDivs.setAttribute("data-no-offers-message", "Parece que no hay plataformas disponibles en este momento para este contenido");
   newDivs.setAttribute("data-title-not-found-message", "No encontramos este título por ahora. Puede que sea muy nuevo y aún no este en ninguna plataforma");
   newDivs.setAttribute("data-id", movieId); // Asigna el valor de movieId

    // Encuentra el contenedor y agrega el nuevo elemento
    container = document.getElementById("jw-widget-container");
    container.innerHTML = ''; // Limpia el contenedor
    container.appendChild(newDivs);

    loadJustWatchScript();
} catch (error) {
    console.error("Ocurrió un error:", error);
}


      var discoverURL = mainURL + movieId + APIkey + "&language=es-MX";

        const discover = new XMLHttpRequest();
        discover.open("GET", discoverURL, true);
        discover.onload = function() {
            var response = JSON.parse(this.responseText);
            imgFile = response.poster_path;
            var descIn = response.overview;
            var title = response.title;
            var yearf = response.release_date === undefined ? response.first_air_date.slice(0,4) : response.release_date.slice(0,4);

            document.getElementById("desc").innerHTML = descIn;
            document.getElementById("descf").innerHTML = descIn;
            document.getElementById("nom").innerHTML = title + " (" + yearf + ")";
            document.getElementById("initial").src = imgPath + imgFile;

            const duracionEnMinutos = response.runtime;
            const horas = Math.floor(duracionEnMinutos / 60);
            const minutos = duracionEnMinutos % 60;
            const duracionFormateada = horas + " h " + minutos + " m";

            var genres = response.genres.map(function(genre) {
                return genre.name;
            });
            var genresDuration = genres.join(", ") + " - " + duracionFormateada;

            document.getElementById("detail").innerHTML = genresDuration;
        }
        discover.send();

        // const platform = new XMLHttpRequest();
        // const getPlat = mainURL + movieId + "/watch/providers" + APIkey;
        // platform.open("GET", getPlat, true);
        // platform.onload = function() {
        //     const response = JSON.parse(this.responseText);
        //     const platformsDiv = document.getElementById("platforms");

        //     platformsDiv.innerHTML = "";

        //     try {
        //         resultsStream = response.results.AR.flatrate;
        //         resultsStream.forEach(function(result) {
        //             var div = document.createElement("div");
        //             div.className = "vh";

        //             var img = document.createElement("img");
        //             img.src = imgPath + result.logo_path;
        //             div.appendChild(img);

        //             var br = document.createElement("br");
        //             div.appendChild(br);

        //             platformsDiv.appendChild(div);
        //         });
        //     } catch(error) {
        //         // Handle error here
        //     }
        // };
        // platform.send();
        };

        baseMov.send();
}

reload();

function getSimilar(movieId) {
    const options = {
        method: 'GET',
        headers: {
            accept: 'application/json',
            Authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJmMzU5ZTRmNTQ5NjgzNjA2OGVkZGE0ODUyN2ZlOGM1OCIsInN1YiI6IjYzODZhNDE5NWVkOGU5MDA4NmFjYjMxZCIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.pFa_ru94R7Vka5oyA3EEtXDQCoCbVbRkQy9zr0fCxZU'
        }
    };
    fetch(`https://api.themoviedb.org/3/movie/${movieId}/similar?language=es-MX&page=1`, options)
        .then(response => response.json())
        .then(data => {
            const resultsArray = data.results; // Suponiendo que la respuesta contiene un array llamado "results"
            // console.log(resultsArray);
        });
}


// INICIO DE BUSQUEDA

movieId = null; // Variable para almacenar el ID de la película seleccionada

document.getElementById('searchInput').addEventListener('input', function() {
  var searchTerm = this.value.trim();
  var apiKey = 'f359e4f5496836068edda48527fe8c58';
  var userLanguage = document.documentElement.lang || 'es-MX';
  var urlMovies = `https://api.themoviedb.org/3/search/multi?api_key=${apiKey}&query=${searchTerm}&include_adult=false&language=${userLanguage}&sort_by=release_date.desc`;
  var showElement = document.getElementById("show");
  let imgPath = "https://image.tmdb.org/t/p/original";

  showElement.style.display = searchTerm === '' ? "none" : "block";


  // TERNA 1 BUSCADOR
  // TERNA 1 BUSCADOR
  // TERNA 1 BUSCADOR
  // TERNA 1 BUSCADOR
  // TERNA 1 BUSCADOR

  // fetch(urlMovies)
  //   .then(response => response.json())
  //   .then(data => {
  //     var results = data.results;
  //     var result = "";
  //     results.forEach(item => {
  //       if (itemExists(item)) {
  //           var imgroute = `https://image.tmdb.org/t/p/original/${item.poster_path}`;
  //           var taip = item.media_type === 'movie' ? "Pelicula" : "Serie";
  //           var year = item.release_date === undefined ? item.first_air_date.slice(0,4) : item.release_date.slice(0,4);
  //         var title = getItemTitleByLanguage(item, searchTerm);
  //         if (title) {
  //           result += `<li data-movie-id="${item.id}" data-media-type="${item.media_type}" onclick="selectMovie(${item.id}, '${item.media_type}'); hideResults()">
  //           <img src="${imgroute}" class="reimg">
  //           ${title} <br>
  //           ${taip} - ${year}
  //           </li>`;
  //         }
  //       }
  //     });

  //     showElement.innerHTML = result;
  //   })
  //   .catch(error => {
  //     console.error('Error:', error);
  //   });

    // TERNA 2 BUSCADOR
    // TERNA 2 BUSCADOR
    // TERNA 2 BUSCADOR
    // TERNA 2 BUSCADOR
    // TERNA 2 BUSCADOR
    // TERNA 2 BUSCADOR
    // TERNA 2 BUSCADOR

// Función para redirigir a la página de búsqueda
  fetch(urlMovies)
    .then(response => response.json())
    .then(data => {
      var results = data.results;
      var result = "";
      results.forEach(item => {
        if (itemExists(item)) {
            var imgroute = `https://image.tmdb.org/t/p/original/${item.poster_path}`;
            var taip = item.media_type === 'movie' ? "Pelicula" : "Serie";
            var year = item.release_date === undefined ? item.first_air_date.slice(0,4) : item.release_date.slice(0,4);
          var title = getItemTitleByLanguage(item, searchTerm);
          if (title) {
            result += `<li data-movie-id="${item.id}" data-media-type="${item.media_type}" onclick="redirectToSearch(${item.id}, '${item.media_type}'); hideResults()">
            <img src="${imgroute}" class="reimg">
            ${title} <br>
            ${taip} - ${year}
          </li>`;

          }
        }
      });

      showElement.innerHTML = result;
    })
    .catch(error => {
      console.error('Error:', error);
    });


    // FIN BUSCADORES
    // FIN BUSCADORES
    // FIN BUSCADORES
    // FIN BUSCADORES
    // FIN BUSCADORES
    // FIN BUSCADORES
    // FIN BUSCADORES

function itemExists(item) {
  return item.media_type === 'movie' || item.media_type === 'tv';
}

});

function loadMovieDetails() {
  if (!movieId) {
    return;
  }

  try {
    // Encuentra el contenedor y borra su contenido anterior
    var container = document.getElementById("jw-widget-container");
    container.innerHTML = ''; // Limpia el contenido anterior

    var newDivs = document.createElement("div");
    newDivs.setAttribute("data-jw-widget", "");
    newDivs.setAttribute("data-api-key", "SMd1XU9yGrR2VMGK2VBBySeB6lEV8AOU");
    newDivs.setAttribute("data-object-type", "movie");
    newDivs.setAttribute("data-id-type", "tmdb");
    newDivs.setAttribute("data-theme", "dark");
    newDivs.setAttribute("data-id", movieId); // Asigna el valor de movieId

    // Encuentra el contenedor y agrega el nuevo elemento
    container = document.getElementById("jw-widget-container");
    container.innerHTML = ''; // Limpia el contenedor
    container.appendChild(newDivs);
    
} catch (error) {
    console.error("Ocurrió un error:", error);
}


  var baseMovURL = `https://api.themoviedb.org/3/${type}/`;
  var APIkey = "?api_key=f359e4f5496836068edda48527fe8c58";
  var mainURL = baseMovURL + movieId + APIkey + "&language=es-MX";
  var imgPath = "https://image.tmdb.org/t/p/original";
  var mainImgPath = "https://image.tmdb.org/t/p/original";

  fetch(mainURL)
    .then(response => response.json())
    .then(data => {
      var imgFile = data.poster_path;
      var descIn = data.overview;
      var titlel = data.title === undefined ? data.name : data.title;
      var yearf = data.release_date === undefined ? data.first_air_date.slice(0,4) : data.release_date.slice(0,4);

      if (data.runtime === undefined) {
        var duracionFormateada = data.seasons.length + " Temporadas";
      }
      else{

      // Duración en minutos obtenida de la API
      const duracionEnMinutos = data.runtime;

      // Cálculo de horas y minutos
      const horas = Math.floor(duracionEnMinutos / 60); // Obtén la parte entera de la división
      const minutos = duracionEnMinutos % 60; // Obtén el resto de la división

      // Formato de salida: "X horas y Y minutos"
      duracionFormateada = horas + " h " + minutos + " m";

        } 

      // var genresDuration = data.genres[0].name + ", " + " - " + duracionFormateada;

        var genres = data.genres.map(function(genre) {
          return genre.name;
        });
        var genresDuration = genres.join(", ") + " - " + duracionFormateada;

        // // Aquí agrega el código para el botón "Ver más"
        //     const descContainer = document.getElementById('desc');
        //     const moreBtn = document.getElementById('more-btn');

        //     function toggleDescription() {
        //         if (descContainer.style.maxHeight === '150px' || descContainer.style.maxHeight === '') {
        //             descContainer.style.maxHeight = descContainer.scrollHeight + "px";
        //             moreBtn.textContent = 'Ver menos';
        //         } else {
        //             descContainer.style.maxHeight = '150px';
        //             moreBtn.textContent = 'Ver más';
        //         }
        //     }

        //     moreBtn.addEventListener('click', toggleDescription);

        //     function toggleMoreBtn() {
        //         if (descContainer.scrollHeight > 150) {
        //             moreBtn.style.display = 'block';
        //         } else {
        //             moreBtn.style.display = 'none';
        //         }
        //     }

        //     // Verificar la altura inicialmente y cada vez que cambie el tamaño de la ventana
        //     toggleMoreBtn();
        //     window.addEventListener('resize', toggleMoreBtn);


      document.getElementById("desc").innerHTML = descIn;
      document.getElementById("descf").innerHTML = descIn;
      document.getElementById("initial").src = mainImgPath + imgFile;
       document.getElementById("nom").innerHTML = titlel + " (" + yearf + ")";
       document.getElementById("fnom").innerHTML = titlel + " (" + yearf + ")";
       document.getElementById("detail").innerHTML = genresDuration;

      var platformsDiv = document.getElementById("platforms");
      platformsDiv.innerHTML = "";

      fetch(baseMovURL + movieId + "/watch/providers" + APIkey)
        .then(response => response.json())
        .then(data => {

          // ENVOLVER EN UN TRY PARA EVITAR QUE FRENE EL CÓDIGO POR NO ENCONTRAR NADA
        try {
          // BUSCAR DE STREAMING
          var resultsStream = data.results.AR.flatrate;
          resultsStream.forEach(result => {
            var div = document.createElement("div");
            div.className = "vh";

            var a = document.createElement("a");

            // Supongamos que tienes una variable llamada linkType que contiene el tipo de enlace que deseas.
            // Puedes cambiar el valor de linkType para modificar el contenido del enlace.
            var linkType = result.provider_name; // Aquí obtienes el valor del tipo de enlace desde donde sea necesario.
            // console.log(linkType);
            switch (linkType) {
              case "Netflix":
                a.href = "https://www.netflix.com/search?q=" + titlel;
                break;
              case "Paramount Plus":
                type
                a.href = "https://www.paramountplus.com/browse";
                break;
              case "Movistar Play":
                a.href = "https://tv.movistar.com.ar/search?q=" + titlel;
                break;
              case "HBO Max":
                a.href = "https://play.hbomax.com/search/" + titlel;
                break;
            case "Claro video":
                a.href = "https://www.clarovideo.com/argentina/search?q=" + titlel;
                break;
            case "Paramount Plus Apple TV Channel ":
                a.href = "https://www.paramountplus.com/browse";
                break;
            case "Amazon Prime Video":
                a.href = "https://www.primevideo.com/search/ref=atv_sr_sug_7?phrase=" + titlel;
                break;
              default:
                a.href = "#";
            }
            // Agregamos el atributo target="_blank" al enlace
        a.setAttribute("target", "_blank");


            var img = document.createElement("img");
            img.src = imgPath + result.logo_path;
            a.appendChild(img); // Agregamos el elemento <img> dentro del elemento <a>
            div.appendChild(a); // Agregamos el elemento <a> dentro del elemento <div>

            platformsDiv.appendChild(div);
          });
        } catch (error) {
          // console.error("Error al agregar una imagen:", error);
        }


        })
        .catch(error => {
          console.error('Error:', error);
        });
    })
    .catch(error => {
      console.error('Error:', error);
    });
}

function getItemTitleByLanguage(item, searchTerm) {
  var preferredLanguage = document.documentElement.lang.split('-')[0]; // Idioma preferido del usuario según el buscador
  var itemTitle = "";

  if (item.media_type === 'movie') {
    itemTitle = item.title || item.original_title;
  } else if (item.media_type === 'tv') {
    itemTitle = item.name || item.original_name;
  }

  if (itemTitle) {
    var availableTitles = Object.keys(item).filter(key => key.startsWith('title_')).map(key => item[key]);
    var preferredTitle = availableTitles.find(title => title && title.toLowerCase().includes(searchTerm.toLowerCase()) && title.slice(0, 2) === preferredLanguage);
    
    if (!preferredTitle) {
      preferredTitle = availableTitles.find(title => title && title.toLowerCase().includes(searchTerm.toLowerCase()));
    }
    
    return preferredTitle || itemTitle;
  }

  return null;
}
function hideResults() {
  var showElement = document.getElementById("show");
  showElement.style.display = "none"; // Oculta el elemento #show al hacer clic en un <li>
}


function loadJustWatchScript() {
    // Crea un elemento script solo si no se ha cargado antes
    if (!window.justWatchLoaded) {
        // Crea un elemento script
        var script = document.createElement('script');
        script.src = 'https://widget.justwatch.com/justwatch_widget.js';
        script.async = true;

        // Define una función de callback para cuando se cargue el script
        script.onload = function () {
            window.justWatchLoaded = true; // Establece una bandera global en verdadero
            console.log("Script de JustWatch cargado correctamente.");
        };

        // Encuentra el elemento head del documento y agrega el script
        var head = document.head || document.getElementsByTagName('head')[0];
        head.appendChild(script);
    }
}

document.addEventListener("DOMContentLoaded", function () {
    const hmbButton = document.querySelector(".hmb");
    const closeBtn = document.getElementById("closeBtn");
    const navbar = document.getElementById("navbar");

    hmbButton.addEventListener("click", function () {
        navbar.classList.remove("hidden");
    });

    closeBtn.addEventListener("click", function () {
        navbar.classList.add("hidden");
    });
});

function redirectToSearch(movieId, mediaType) {
    // Construye la URL de redirección con los parámetros necesarios
    const searchUrl = `search.html?id=${movieId}&media_type=${mediaType}`;

    // Redirige a la página de búsqueda
    window.location.href = searchUrl;
  }

document.addEventListener("DOMContentLoaded", function() {
    const toggleTitles = document.querySelectorAll(".toggle-title");

    toggleTitles.forEach(function(title) {
        title.addEventListener("click", function() {
            const content = this.nextElementSibling;

            if (content.style.display === "none" || content.style.display === "") {
                content.style.display = "block";
            } else {
                content.style.display = "none";
            }
        });
    });
});


















