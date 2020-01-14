define(["./Library", "./Route"], function RouterPiece(Library, Route) {

	var route = Route.get();

	function RouterPiece(page) {

		this.page = page;

		var routeIndex = -1;

		this.onBind = function(element) {

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
				}
			});

		function registerRoute() {

			var word;

			if (typeof page.route == "function") {

				word = {

					set: function(word, routeIndex, callback) {

						callback();
						page.route(word && decodeURIComponent(word));
						route.update(routeIndex);
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
						route.update(routeIndex);
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
