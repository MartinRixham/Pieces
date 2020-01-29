define(["./Library", "./Route"], function RouterPiece(Library, Route) {

	function RouterPiece(page) {

		this.page = page;

		var router;

		var initialised;

		this.onBind = function(element) {

			initialised = false;

			var event = document.createEvent("Event");
			event.initEvent("__PIECES_BIND__", true, true);
			element.dispatchEvent(event);

			var route = Route.get();

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

			router = registerRoute(route);
		};

		this.route =
			new Library.Binding({

				init: function() {

					router.setUpdating();
				},
				update: function() {

					router.update();
					initialised = true;
				}
			});

		function registerRoute(route) {

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
