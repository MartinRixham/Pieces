define(["./Library", "./Route"], function RouterPiece(Library, Route) {

	var route = Route.get();

	function RouterPiece(page) {

		this.page = page;

		var routeIndex;

		var initialised;

		this.onBind = function(element) {

			initialised = false;
			var event = document.createEvent("Event");
			event.initEvent("__PIECES_BIND__", true, true);
			element.dispatchEvent(event);

			while (element.firstChild) {

				element.removeChild(element.firstChild);
			}

			var hidden = document.createElement("DIV");
			hidden.dataset.bind = "route";
			hidden.style.display = "none";

			var container = document.createElement("DIV");
			container.dataset.bind = "page";

			element.appendChild(hidden);
			element.appendChild(container);

			routeIndex = registerRoute();
		};

		this.route =
			new Library.Binding({

				init: function() {

					route.setUpdating();
				},
				update: function() {

					route.update(routeIndex);
					initialised = true;
				}
			});

		function registerRoute() {

			var word;

			if (typeof page.route == "function") {

				word = {

					set: function(word, routeIndex, callback) {

						callback();
						page.route(word && decodeURIComponent(word));

						if (!initialised) {

							route.update(routeIndex);
						}
					},
					get: function() {

						return encodeURIComponent(page.route());
					}
				};
			}
			else {

				word = {

					set: function(word, routeIndex, callback) {

						callback();
						page.route = word && decodeURIComponent(word);

						if (!initialised) {

							route.update(routeIndex);
						}
					},
					get: function() {

						return encodeURIComponent(page.route);
					}
				};
			}

			return route.addRoute(word);
		}
	}

	return RouterPiece;
});
