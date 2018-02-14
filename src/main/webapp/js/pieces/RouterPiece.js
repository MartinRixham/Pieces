define(["./Route"], function RouterPiece(Route) {

	var route = new Route();

	function RouterPiece(page) {

		this.page = page;

		var routeIndex = -1;

		var updating = -1;

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

			updating = -1;
		};

		this.route =
			new Binding({

				init: function() {

					routeIndex = registerRoute();
				},
				update: function() {

					if (updating > 0) {

						updating--;

						return;
					}

					route.update(routeIndex);
				},
				destroy: function() {

					route.remove(routeIndex);
				}
			});

		function registerRoute() {

			var word;

			if (typeof page.route == "function") {

				word = {

					set: function(route) {

						updating++;

						page.route(route);
					},
					get: function() {

						return page.route();
					}
				};
			}
			else {

				word = {

					set: function(route) {

						updating++;

						page.route = route;
					},
					get: function() {

						return page.route;
					}
				};
			}

			return route.addRoute(word);
		}
	}

	return RouterPiece;
});
