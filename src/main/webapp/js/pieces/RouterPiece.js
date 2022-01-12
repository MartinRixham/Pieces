define(["./Library", "./Route"], function RouterPiece(Library, Route) {

	function RouterPiece(page) {

		var self = this;

		this.datumPiecesPage = page;

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
			container.dataset.bind = "datumPiecesPage";

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

					router.update(this);
					initialised = true;
				}
			});

		function registerRoute(route) {

			var word;

			if (typeof page.route == "function") {

				word = getWord(
					function() { return page.route(); },
					function(value) { page.route(value); },
					route);
			}
			else {

				word = getWord(
					function() { return page.route; },
					function(value) { page.route = value; },
					route);
			}

			return route.addRoute(word);
		}

		function getWord(get, set, route) {

			return {

				set: function(word, routeIndex, callback) {

					callback();
					set(word && decodeURIComponent(word));

					if (!initialised) {

						route.update(routeIndex);
					}
				},
				get: function(nonBlank, reference) {

					if (reference == self) {

						return encodeURIComponent(get());
					}
				}
			};
		}
	}

	return RouterPiece;
});
